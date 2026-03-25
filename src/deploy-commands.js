const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');

console.log("🚀 INICIANDO DEPLOY...");

const commands = [
    new SlashCommandBuilder()
        .setName('calculo')
        .setDescription('Calcular valor de Robux'),
    new SlashCommandBuilder()
        .setName('anunciar')
        .setDescription('Enviar mensagem profissional no canal (Staff)')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal para enviar (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('Título do anúncio (opcional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('cor')
                .setDescription('Cor do embed (verde, vermelho, azul, etc)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('imagem')
                .setDescription('URL da imagem (opcional)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('afiliado')
        .setDescription('Tornar-se um afiliado (requer cargo)'),
    new SlashCommandBuilder()
        .setName('registrarlink')
        .setDescription('Registrar um link de convite como seu link de afiliado')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('Link de convite (ex: https://discord.gg/abc123)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('meuslinks')
        .setDescription('Listar todos os seus links de afiliado'),
    new SlashCommandBuilder()
        .setName('deletarlink')
        .setDescription('Deletar um link de afiliado')
        .addStringOption(option =>
            option.setName('codigo')
                .setDescription('Código do link para deletar')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('minhasvendas')
        .setDescription('Ver suas vendas como afiliado'),
    new SlashCommandBuilder()
        .setName('saldo')
        .setDescription('Ver seu saldo disponível para saque'),
    new SlashCommandBuilder()
        .setName('sacar')
        .setDescription('Solicitar saque do saldo')
        .addStringOption(option =>
            option.setName('metodo')
                .setDescription('Método de saque')
                .setRequired(true)
                .addChoices(
                    { name: '💰 Dinheiro (Pix)', value: 'dinheiro' },
                    { name: '🎮 Robux', value: 'robux' }
                ))
        .addStringOption(option =>
            option.setName('valor')
                .setDescription('Valor em R$ (mínimo 30)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('historico')
        .setDescription('Ver histórico de saques'),
    new SlashCommandBuilder()
        .setName('saquespendentes')
        .setDescription('Listar saques pendentes (apenas dono)'),
    new SlashCommandBuilder()
        .setName('afiliados')
        .setDescription('Listar todos os afiliados (apenas staff)'),
    new SlashCommandBuilder()
        .setName('pendentes')
        .setDescription('Listar vendas pendentes (apenas dono)')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('🔄 Registrando comandos...');
        console.log(`📝 Comandos: ${commands.map(c => c.name).join(', ')}`);

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );

        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error('❌ ERRO:', error);
    }
})();