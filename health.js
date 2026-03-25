const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot está online!');
});

server.listen(3000, () => {
    console.log('Health check server running on port 3000');
});