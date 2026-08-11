const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// ANTI-CACHE MIDDLEWARE (FIXES STALE DATA)
// ==========================================
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET environment variable is missing.');
    process.exit(1);
}

// ==========================================
// MIDDLEWARE
// ==========================================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified; 
        next();
    } catch (err) {
        res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

const verifyAdmin = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        next();
    });
};

// ==========================================
// AUTHENTICATION
// ==========================================
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.trim().toLowerCase() === 'admin') return res.status(400).json({ error: 'Reserved username.' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO Users (username, password, role) VALUES (?, ?, ?)', [username.trim(), hashedPassword, 'public']);
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already taken.' });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await db.execute('SELECT * FROM Users WHERE username = ?', [username]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = users[0];
        let validPassword = false;

        if (user.password.startsWith('$2b$')) {
            validPassword = await bcrypt.compare(password, user.password);
        } else {
            validPassword = (password === user.password);
            if (validPassword) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await db.execute('UPDATE Users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
            }
        }

        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ token, role: user.role, username: user.username, userId: user.id });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==========================================
// TOURNAMENTS
// ==========================================
app.get('/api/tournaments', async (req, res) => {
    try {
        const [tournaments] = await db.execute('SELECT * FROM Tournaments ORDER BY tournament_id DESC');
        res.status(200).json(tournaments);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/tournaments/:id', async (req, res) => {
    const tournamentId = req.params.id;
    try {
        const [tournaments] = await db.execute('SELECT * FROM Tournaments WHERE tournament_id = ?', [tournamentId]);
        if (tournaments.length === 0) return res.status(404).json({ error: 'Tournament not found' });
        res.status(200).json(tournaments[0]);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/tournaments', verifyAdmin, async (req, res) => {
    const { name, game_title, start_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Tournament name required' });

    try {
        const game = game_title || 'Valorant';
        const [result] = await db.execute('INSERT INTO Tournaments (name, game_title, start_date, status) VALUES (?, ?, ?, ?)', [name, game, start_date || null, 'REGISTRATION_OPEN']);
        res.status(201).json({ message: 'Tournament created successfully!', tournamentId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==========================================
// BALANCED BRACKET GENERATOR (POWER OF 2 PADDING)
// ==========================================
app.post('/api/tournaments/:id/generate-bracket', verifyAdmin, async (req, res) => {
    const tournamentId = req.params.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        
        await connection.execute('DELETE FROM Matches WHERE tournament_id = ?', [tournamentId]);

        const [teams] = await connection.execute('SELECT team_id FROM Teams WHERE tournament_id = ?', [tournamentId]);
        if (teams.length < 2) {
            await connection.rollback();
            return res.status(400).json({ error: 'At least 2 teams are required to generate a bracket.' });
        }

        const shuffledTeams = teams.sort(() => Math.random() - 0.5);

        let bracketSize = 2;
        while (bracketSize < shuffledTeams.length) {
            bracketSize *= 2;
        }

        const numRounds = Math.log2(bracketSize);
        let matchesByRound = [];

        for (let r = 1; r <= numRounds; r++) {
            const matchCount = bracketSize / Math.pow(2, r);
            matchesByRound.push({ round: r, matches: Array(matchCount).fill(null) });
        }

        for (let r = numRounds; r >= 1; r--) {
            const roundIndex = r - 1;
            const matchCount = matchesByRound[roundIndex].matches.length;
            const createdMatchIds = [];

            for (let i = 0; i < matchCount; i++) {
                let nextMatchId = null;
                if (r > 1) {
                    const parentMatchIndex = Math.floor(i / 2);
                    nextMatchId = matchesByRound[roundIndex - 1].matches[parentMatchIndex];
                }

                const [mRes] = await connection.execute(
                    'INSERT INTO Matches (tournament_id, round_number, next_match_id, score_a, score_b) VALUES (?, ?, ?, 0, 0)',
                    [tournamentId, r, nextMatchId]
                );
                createdMatchIds.push(mRes.insertId);
            }
            matchesByRound[roundIndex].matches = createdMatchIds;
        }

        const round1Matches = matchesByRound[0].matches;
        for (let i = 0; i < round1Matches.length; i++) {
            const teamA = shuffledTeams[i * 2] ? shuffledTeams[i * 2].team_id : null;
            const teamB = shuffledTeams[i * 2 + 1] ? shuffledTeams[i * 2 + 1].team_id : null;
            const matchId = round1Matches[i];

            await connection.execute(
                'UPDATE Matches SET team_a_id = ?, team_b_id = ? WHERE match_id = ?',
                [teamA, teamB, matchId]
            );

            if (teamA && !teamB) {
                const [matchRow] = await connection.execute('SELECT next_match_id FROM Matches WHERE match_id = ?', [matchId]);
                const nextMatchId = matchRow[0].next_match_id;
                if (nextMatchId) {
                    const [feeders] = await connection.execute('SELECT match_id FROM Matches WHERE next_match_id = ? ORDER BY match_id ASC', [nextMatchId]);
                    const targetCol = feeders[0].match_id == matchId ? 'team_a_id' : 'team_b_id';
                    await connection.execute(`UPDATE Matches SET ${targetCol} = ? WHERE match_id = ?`, [teamA, nextMatchId]);
                    await connection.execute('UPDATE Matches SET winner_id = ? WHERE match_id = ?', [teamA, matchId]);
                }
            }
        }

        await connection.execute('UPDATE Tournaments SET status = ? WHERE tournament_id = ?', ['ONGOING', tournamentId]);
        await connection.commit();

        res.status(201).json({ message: 'Balanced single elimination bracket generated successfully!' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

app.post('/api/tournaments/:id/generate-manual-bracket', verifyAdmin, async (req, res) => {
    const tournamentId = req.params.id;
    const { matchups } = req.body;

    if (!matchups || !Array.isArray(matchups) || matchups.length === 0) {
        return res.status(400).json({ error: 'Manual matchups are required.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        await connection.execute('DELETE FROM Matches WHERE tournament_id = ?', [tournamentId]);

        let roundNum = 1;
        let currentRoundMatchIds = [];

        for (let pair of matchups) {
            const teamA = pair.team_a_id || null;
            const teamB = pair.team_b_id !== undefined ? pair.team_b_id : null;

            const [mRes] = await connection.execute(
                'INSERT INTO Matches (tournament_id, round_number, team_a_id, team_b_id, winner_id, score_a, score_b) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [tournamentId, roundNum, teamA, teamB, null, 0, 0]
            );
            currentRoundMatchIds.push(mRes.insertId);
        }

        let prevRoundIds = currentRoundMatchIds;
        while (prevRoundIds.length > 1) {
            roundNum++;
            const nextRoundIds = [];
            for (let i = 0; i < prevRoundIds.length; i += 2) {
                const [nextRes] = await connection.execute(
                    'INSERT INTO Matches (tournament_id, round_number) VALUES (?, ?)',
                    [tournamentId, roundNum]
                );
                const nextMatchId = nextRes.insertId;
                nextRoundIds.push(nextMatchId);

                await connection.execute('UPDATE Matches SET next_match_id = ? WHERE match_id IN (?, ?)', [
                    nextMatchId,
                    prevRoundIds[i],
                    prevRoundIds[i + 1] || prevRoundIds[i]
                ]);
            }
            prevRoundIds = nextRoundIds;
        }

        await connection.execute('UPDATE Tournaments SET status = ? WHERE tournament_id = ?', ['ONGOING', tournamentId]);
        await connection.commit();

        res.status(201).json({ message: 'Manual elimination bracket generated successfully!' });
    } catch (error) {
        await connection.rollback();
        console.error('Manual bracket error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

app.delete('/api/tournaments/:id/bracket', verifyAdmin, async (req, res) => {
    const tournamentId = req.params.id;
    const connection = await db.getConnection();
    try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('DELETE FROM Matches WHERE tournament_id = ?', [tournamentId]);
        await connection.query('UPDATE Tournaments SET status = ? WHERE tournament_id = ?', ['REGISTRATION_OPEN', tournamentId]);
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        
        res.status(200).json({ message: 'Bracket reset successfully' });
    } catch (error) {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        console.error('Reset bracket error:', error);
        res.status(500).json({ error: error.message || 'Failed to reset bracket' });
    } finally {
        connection.release();
    }
});

app.delete('/api/tournaments/:id', verifyAdmin, async (req, res) => {
    const tournamentId = req.params.id;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('DELETE FROM Matches WHERE tournament_id = ?', [tournamentId]);
        const [teams] = await connection.execute('SELECT team_id FROM Teams WHERE tournament_id = ?', [tournamentId]);
        for (let t of teams) {
            await connection.execute('DELETE FROM Team_Rosters WHERE team_id = ?', [t.team_id]);
        }
        await connection.execute('DELETE FROM Teams WHERE tournament_id = ?', [tournamentId]);
        await connection.execute('DELETE FROM Tournaments WHERE tournament_id = ?', [tournamentId]);
        await connection.commit();
        res.status(200).json({ message: 'Tournament deleted' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Failed to delete tournament' });
    } finally {
        connection.release();
    }
});

// ==========================================
// TEAMS & MATCHES
// ==========================================
app.get('/api/teams', async (req, res) => {
    try {
        const [teams] = await db.execute(`
            SELECT Teams.team_id, Teams.name AS team_name, Players.riot_id AS captain_riot_id, Teams.tournament_id, Teams.user_id
            FROM Teams JOIN Players ON Teams.captain_id = Players.player_id
        `);
        res.status(200).json(teams);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/tournaments/:id/teams', async (req, res) => {
    const tournamentId = req.params.id;
    try {
        const query = `
            SELECT Teams.team_id, Teams.name AS team_name, Players.riot_id AS captain_riot_id, Teams.tournament_id, Teams.user_id
            FROM Teams 
            JOIN Players ON Teams.captain_id = Players.player_id
            WHERE Teams.tournament_id = ?
        `;
        const [teams] = await db.execute(query, [tournamentId]);
        res.status(200).json(teams);
    } catch (error) {
        console.error('Fetch tournament teams error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/teams/:id/roster', async (req, res) => {
    const teamId = req.params.id;
    try {
        const [teamRows] = await db.execute(`
            SELECT t.team_id, t.name as team_name, p.riot_id as captain, t.tournament_id, t.user_id 
            FROM Teams t 
            LEFT JOIN Players p ON t.captain_id = p.player_id 
            WHERE t.team_id = ?
        `, [teamId]);
        
        if (teamRows.length === 0) return res.status(404).json({ error: 'Team not found' });
        
        const [players] = await db.execute(`
            SELECT p.riot_id 
            FROM Team_Rosters tr 
            JOIN Players p ON tr.player_id = p.player_id 
            WHERE tr.team_id = ?
            ORDER BY p.player_id ASC
        `, [teamId]);

        const captainName = teamRows[0].captain || 'Not Listed';
        const allPlayerNames = [];
        players.forEach(p => {
            if (p.riot_id && p.riot_id !== captainName && !allPlayerNames.includes(p.riot_id)) {
                allPlayerNames.push(p.riot_id);
            }
        });

        const members = allPlayerNames.slice(0, 4);
        const subs = allPlayerNames.slice(4);

        res.status(200).json({
            team_name: teamRows[0].team_name,
            captain: captainName,
            members: members,
            subs: subs
        });
    } catch (error) {
        console.error('Roster error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/teams/bulk', verifyToken, async (req, res) => {
    const { tournament_id, team_name, captain, members, subs } = req.body;
    const userId = req.user.id;

    if (!team_name || !captain || !tournament_id) return res.status(400).json({ error: 'Missing required fields' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [tCheck] = await connection.execute('SELECT status FROM Tournaments WHERE tournament_id = ?', [tournament_id]);
        if (tCheck.length === 0 || tCheck[0].status !== 'REGISTRATION_OPEN') {
            await connection.rollback();
            return res.status(400).json({ error: 'Registration is closed.' });
        }

        const addToRoster = async (ign, teamId) => {
            if (!ign) return null;
            let pId;
            try {
                const mockEmail = ign.replace(/\s+/g, '').toLowerCase() + '@esports.com';
                const [pRes] = await connection.execute('INSERT INTO Players (riot_id, email) VALUES (?, ?)', [ign, mockEmail]);
                pId = pRes.insertId;
            } catch(e) {
                const [extP] = await connection.execute('SELECT player_id FROM Players WHERE riot_id = ?', [ign]);
                if (extP.length > 0) pId = extP[0].player_id;
            }
            if (pId && teamId) await connection.execute('INSERT IGNORE INTO Team_Rosters (team_id, player_id) VALUES (?, ?)', [teamId, pId]);
            return pId;
        };

        const capId = await addToRoster(captain, null);
        const [teamRes] = await connection.execute('INSERT INTO Teams (name, captain_id, tournament_id, user_id) VALUES (?, ?, ?, ?)', [team_name, capId, tournament_id, userId]);
        const teamId = teamRes.insertId;

        await connection.execute('INSERT IGNORE INTO Team_Rosters (team_id, player_id) VALUES (?, ?)', [teamId, capId]);
        for (let m of members) await addToRoster(m, teamId);
        for (let s of subs) await addToRoster(s, teamId);

        await connection.commit();
        res.status(201).json({ message: 'Team registered successfully!' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

app.delete('/api/teams/:id', verifyAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM Teams WHERE team_id = ?', [req.params.id]);
        res.status(200).json({ message: 'Team deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete team' });
    }
});

app.get('/api/tournaments/:id/bracket', async (req, res) => {
    const tournamentId = req.params.id;
    try {
        const query = `
            SELECT 
                m.match_id, m.round_number, m.team_a_id, tA.name AS team_a_name,
                m.score_a, m.team_b_id, tB.name AS team_b_name, m.score_b,
                m.winner_id, m.next_match_id
            FROM Matches m
            LEFT JOIN Teams tA ON m.team_a_id = tA.team_id
            LEFT JOIN Teams tB ON m.team_b_id = tB.team_id
            WHERE m.tournament_id = ?
            ORDER BY m.round_number ASC, m.match_id ASC
        `;
        const [matches] = await db.execute(query, [tournamentId]);
        
        const roundsMap = {};
        matches.forEach(m => {
            const rNum = m.round_number;
            if (!roundsMap[rNum]) {
                roundsMap[rNum] = {
                    round_number: rNum,
                    title: rNum === 1 ? 'Quarter-Finals' : (rNum === 2 ? 'Semi-Finals' : 'Finals'),
                    matches: []
                };
            }
            roundsMap[rNum].matches.push(m);
        });

        const rounds = Object.values(roundsMap);
        res.status(200).json({ rounds });
    } catch (error) {
        console.error('Bracket fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/matches/:id', verifyAdmin, async (req, res) => {
    const matchId = req.params.id;
    let { score_a, score_b, winner_id } = req.body;

    if (score_a === undefined || score_b === undefined) return res.status(400).json({ error: 'Scores required' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [matchRows] = await connection.execute('SELECT tournament_id, next_match_id, team_a_id, team_b_id FROM Matches WHERE match_id = ?', [matchId]);
        if (matchRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Match not found' });
        }

        const currentMatch = matchRows[0];
        const tournamentId = currentMatch.tournament_id;
        const nextMatchId = currentMatch.next_match_id;

        if (!currentMatch.team_b_id) {
            winner_id = currentMatch.team_a_id;
        }

        if (!winner_id) {
            await connection.rollback();
            return res.status(400).json({ error: 'Winner required' });
        }

        const isValidParticipant = (winner_id === currentMatch.team_a_id) || (winner_id === currentMatch.team_b_id);
        if (!isValidParticipant) {
            await connection.rollback();
            return res.status(400).json({ error: 'Winner must be a participant' });
        }

        await connection.execute('UPDATE Matches SET score_a = ?, score_b = ?, winner_id = ? WHERE match_id = ?', [score_a, score_b, winner_id, matchId]);

        if (nextMatchId) {
            const [feedingMatches] = await connection.execute(
                'SELECT match_id FROM Matches WHERE next_match_id = ? ORDER BY match_id ASC',
                [nextMatchId]
            );

            let targetColumn = null;
            if (feedingMatches.length > 0) {
                if (feedingMatches[0].match_id == matchId) {
                    targetColumn = 'team_a_id';
                } else if (feedingMatches.length > 1 && feedingMatches[1].match_id == matchId) {
                    targetColumn = 'team_b_id';
                }
            }

            if (targetColumn) {
                await connection.execute(`UPDATE Matches SET ${targetColumn} = ? WHERE match_id = ?`, [winner_id, nextMatchId]);
            }
        } else {
            await connection.execute('UPDATE Tournaments SET status = ? WHERE tournament_id = ?', ['COMPLETED', tournamentId]);
        }

        await connection.commit();
        res.status(200).json({ message: 'Score updated and winner advanced!' });
    } catch (error) {
        await connection.rollback();
        console.error('Match update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// ==========================================
// VERCEL ANGULAR FRONTEND SERVING
// ==========================================
const possibleFrontendPaths = [
    path.join(__dirname, 'dist'),
    path.join(process.cwd(), 'dist')
];

const frontendPath = possibleFrontendPaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possibleFrontendPaths[0];

app.use(express.static(frontendPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

app.use((req, res) => {
    const indexPath = path.join(frontendPath, 'index.html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(404).send(`Error: Angular frontend not found at ${indexPath}`);
        }
    });
});

module.exports = app;