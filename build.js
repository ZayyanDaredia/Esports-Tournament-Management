const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- STARTING ANGULAR BUILD ---');
try {
    execSync('npm run build --prefix esports-frontend', { stdio: 'inherit' });
} catch (err) {
    console.error('Angular build failed:', err);
    process.exit(1);
}

console.log('--- COPYING BUILD TO ROOT DIST ---');
const possibleSrcDirs = [
    path.join(__dirname, 'esports-frontend', 'dist', 'esports-frontend', 'browser'),
    path.join(__dirname, 'esports-frontend', 'dist', 'esports-frontend'),
    path.join(__dirname, 'esports-frontend', 'dist')
];

const srcDir = possibleSrcDirs.find(d => fs.existsSync(path.join(d, 'index.html')));

if (!srcDir) {
    console.error('Error: Could not find Angular build output index.html');
    process.exit(1);
}

const destDir = path.join(__dirname, 'dist');

function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyRecursive(srcDir, destDir);
console.log(`Successfully copied frontend from ${srcDir} to ${destDir}`);