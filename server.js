const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('✅ Bot Robux Brasil está online!');
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
});