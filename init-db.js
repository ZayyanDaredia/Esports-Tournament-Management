const pool = require('./db');

const createTables = async () => {
    try {
        console.log('Connecting to Aiven MySQL and creating tables...');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS Users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'public'
            );
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS Tournaments (
                tournament_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                game_title VARCHAR(100) DEFAULT 'Valorant',
                start_date DATE DEFAULT NULL,
                status VARCHAR(50) DEFAULT 'REGISTRATION_OPEN'
            );
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS Players (
                player_id INT AUTO_INCREMENT PRIMARY KEY,
                riot_id VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) NOT NULL
            );
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS Teams (
                team_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                captain_id INT,
                tournament_id INT,
                user_id INT,
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id) ON DELETE CASCADE,
                FOREIGN KEY (captain_id) REFERENCES Players(player_id) ON DELETE SET NULL,
                FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
            );
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS Team_Rosters (
                team_id INT,
                player_id INT,
                PRIMARY KEY (team_id, player_id),
                FOREIGN KEY (team_id) REFERENCES Teams(team_id) ON DELETE CASCADE,
                FOREIGN KEY (player_id) REFERENCES Players(player_id) ON DELETE CASCADE
            );
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS Matches (
                match_id INT AUTO_INCREMENT PRIMARY KEY,
                tournament_id INT,
                round_number INT,
                team_a_id INT,
                team_b_id INT,
                score_a INT DEFAULT NULL,
                score_b INT DEFAULT NULL,
                winner_id INT DEFAULT NULL,
                next_match_id INT DEFAULT NULL,
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id) ON DELETE CASCADE,
                FOREIGN KEY (team_a_id) REFERENCES Teams(team_id) ON DELETE CASCADE,
                FOREIGN KEY (team_b_id) REFERENCES Teams(team_id) ON DELETE CASCADE,
                FOREIGN KEY (winner_id) REFERENCES Teams(team_id) ON DELETE SET NULL,
                FOREIGN KEY (next_match_id) REFERENCES Matches(match_id) ON DELETE SET NULL
            );
        `);

        console.log('✅ All tables successfully created in your Aiven cloud database!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating tables:', error);
        process.exit(1);
    }
};

createTables();