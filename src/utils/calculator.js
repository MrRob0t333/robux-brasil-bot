function calculateRobux(robux, method) {
    const prices = {
        gamepass: 40.90,
        grupo: 29.99
    };

    const pricePerThousand = prices[method];
    if (!pricePerThousand) return null;

    const totalPrice = (robux / 1000) * pricePerThousand;
    const formattedPrice = totalPrice.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });

    return {
        robux: robux,
        method: method === 'gamepass' ? 'Gamepass' : 'Grupo',
        pricePerThousand: pricePerThousand,
        totalPrice: totalPrice,
        formattedPrice: formattedPrice,
        pricePerRobux: (pricePerThousand / 1000).toFixed(4)
    };
}

function generateCalculationEmbed(result) {
    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
        .setTitle('💰 Calculadora de Robux')
        .setDescription(`**${result.robux.toLocaleString()} Robux** via **${result.method}**`)
        .addFields(
            { name: '📊 Preço por 1.000 Robux', value: `R$ ${result.pricePerThousand.toFixed(2)}`, inline: true },
            { name: '💵 Valor total', value: result.formattedPrice, inline: true },
            { name: '📈 Preço por Robux', value: `R$ ${result.pricePerRobux}`, inline: true }
        )
        .setColor(result.method === 'Gamepass' ? 0x5865F2 : 0x57F287)
        .setFooter({ text: 'Robux Brasil • Preços sujeitos a alteração' })
        .setTimestamp();

    return embed;
}

module.exports = { calculateRobux, generateCalculationEmbed };