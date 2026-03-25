const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/tickets.json');

function load() {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({ count: 0 }));
    }
    return JSON.parse(fs.readFileSync(filePath));
}

function save(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getNextTicketNumber() {
    const data = load();
    data.count += 1;
    save(data);
    return data.count;
}

module.exports = { getNextTicketNumber };