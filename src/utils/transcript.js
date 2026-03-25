const fs = require('fs');
const path = require('path');
const moment = require('moment');
moment.locale('pt-br');

const transcriptsDir = path.join(__dirname, '../../data/transcripts');

if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
}

async function generateTranscript(channel, closerName, claimedBy = 'Ninguém') {
    let messages = await channel.messages.fetch({ limit: 100 });
    messages = Array.from(messages.values()).reverse();

    const creatorId = channel.topic;
    let creatorName = 'Usuário Desconhecido';
    if (creatorId) {
        try {
            const user = await channel.client.users.fetch(creatorId);
            creatorName = user.tag;
        } catch (e) { }
    }

    const html = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Transcript - ${channel.name}</title>
    <style>
        body { font-family: Arial; background: #36393f; color: #fff; padding: 20px; }
        .message { border-bottom: 1px solid #40444b; padding: 10px; }
        .author { color: #7289da; font-weight: bold; }
        .timestamp { color: #72767d; font-size: 12px; }
    </style>
</head>
<body>
    <h1>Transcript: ${channel.name}</h1>
    <p><strong>Cliente:</strong> ${creatorName}</p>
    <p><strong>Atendente:</strong> ${claimedBy}</p>
    <p><strong>Fechado por:</strong> ${closerName}</p>
    <p><strong>Data:</strong> ${moment().format('DD/MM/YYYY HH:mm:ss')}</p>
    <hr>
    ${messages.map(msg => `
        <div class="message">
            <span class="author">${msg.author.tag}</span>
            <span class="timestamp">${moment(msg.createdAt).format('DD/MM/YYYY HH:mm:ss')}</span>
            <div>${msg.content || '*sem texto*'}</div>
        </div>
    `).join('')}
</body>
</html>
    `;

    const fileName = `${channel.name}_${moment().format('YYYY-MM-DD_HH-mm-ss')}.html`;
    const filePath = path.join(transcriptsDir, fileName);
    fs.writeFileSync(filePath, html);
    return filePath;
}

module.exports = { generateTranscript };