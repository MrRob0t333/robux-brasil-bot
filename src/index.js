// Servidor web para keep-alive
try {
    require('../server');
    console.log('✅ Servidor web iniciado');
} catch (err) {
    console.log('⚠️ Servidor não iniciado:', err.message);
}

const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const config = require('./config');
const affiliates = require('./utils/affiliates');
const { getNextTicketNumber } = require('./utils/store');
const { generateTranscript } = require('./utils/transcript');
const { calculateRobux, generateCalculationEmbed } = require('./utils/calculator');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Arquivo para persistir os convites
const invitesFile = path.join(__dirname, '../data/invites_cache.json');

// Carregar convites salvos
let savedInvites = new Map();
if (fs.existsSync(invitesFile)) {
    try {
        const data = JSON.parse(fs.readFileSync(invitesFile));
        savedInvites = new Map(Object.entries(data));
        console.log(`📁 Convites carregados do arquivo: ${savedInvites.size}`);
    } catch (e) {}
}

// Salvar convites em arquivo
function saveInvitesToFile() {
    const data = Object.fromEntries(savedInvites);
    fs.writeFileSync(invitesFile, JSON.stringify(data, null, 2));
}

// Função para atualizar cache de convites
async function updateInviteCache(guild) {
    try {
        const invites = await guild.invites.fetch();
        const newCache = new Map();
        
        invites.forEach(invite => {
            newCache.set(invite.code, {
                code: invite.code,
                uses: invite.uses || 0,
                inviterId: invite.inviter?.id,
                inviterTag: invite.inviter?.tag,
                url: `https://discord.gg/${invite.code}`
            });
        });
        
        for (const [code, invite] of newCache) {
            savedInvites.set(code, invite);
        }
        saveInvitesToFile();
        
        console.log(`📋 Cache de convites atualizado: ${newCache.size} convites`);
        return newCache;
    } catch (error) {
        console.error('Erro ao atualizar cache de convites:', error);
        return null;
    }
}

// ==================== DETECTAR QUANDO ALGUÉM ENTRA NO SERVIDOR ====================
client.on('guildMemberAdd', async (member) => {
    console.log(`👤 Novo membro: ${member.user.tag} (${member.id})`);
    
    try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const currentInvites = await member.guild.invites.fetch();
        let usedInvite = null;
        
        for (const [code, currentInvite] of currentInvites) {
            const cachedInvite = savedInvites.get(code);
            if (cachedInvite) {
                if (currentInvite.uses > cachedInvite.uses) {
                    usedInvite = currentInvite;
                    console.log(`🔍 Convite usado: ${code} (${cachedInvite.uses} -> ${currentInvite.uses}) por ${currentInvite.inviter?.tag}`);
                    break;
                }
            } else if (currentInvite.uses > 0) {
                usedInvite = currentInvite;
                console.log(`🔍 Novo convite detectado: ${code} com ${currentInvite.uses} usos`);
                break;
            }
        }
        
        if (usedInvite && usedInvite.inviter) {
            const affiliate = affiliates.getAffiliate(usedInvite.inviter.id);
            if (affiliate) {
                const affiliateId = affiliates.registerEntryByInvite(usedInvite.code, member.id, member.user.tag);
                if (affiliateId) {
                    console.log(`✅ REGISTRADO: ${member.user.tag} veio do link de ${usedInvite.inviter.tag}`);
                    
                    const links = affiliates.getAffiliateLinks(usedInvite.inviter.id);
                    const linkIndex = links.findIndex(l => l.code === usedInvite.code);
                    if (linkIndex !== -1) {
                        links[linkIndex].uses = currentInvites.get(usedInvite.code)?.uses || usedInvite.uses;
                    }
                    
                    try {
                        const inviter = await client.users.fetch(usedInvite.inviter.id);
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('🔔 Novo indicado!')
                            .setDescription(`
**${member.user.tag}** acabou de entrar usando seu link de afiliado!

**Link:** ${usedInvite.url}
**Total de usos:** ${usedInvite.uses}

Quando ele comprar acima de 400 Robux ou uma Gamepass, você ganha 10% da venda.
Use \`/minhasvendas\` para acompanhar.
                            `)
                            .setColor(0x00FF00)
                            .setTimestamp();
                        await inviter.send({ embeds: [dmEmbed] }).catch(() => {});
                    } catch (e) {}
                }
            } else {
                console.log(`ℹ️ ${usedInvite.inviter.tag} não é afiliado, ignorando...`);
            }
        } else {
            console.log(`ℹ️ Não foi possível determinar qual convite foi usado por ${member.user.tag}`);
        }
        
        await updateInviteCache(member.guild);
        
    } catch (error) {
        console.error('Erro ao processar entrada:', error);
    }
});

// ==================== FUNÇÃO PARA VERIFICAR CARGO DE AFILIADO ====================
function hasAffiliateRole(member) {
    return member.roles.cache.has(config.affiliateRole);
}

// ==================== TODAS AS INTERAÇÕES ====================
client.on('interactionCreate', async (interaction) => {
    
    // ==================== COMANDOS SLASH ====================
    if (interaction.isChatInputCommand()) {
        
        // COMANDO /calculo
        if (interaction.commandName === 'calculo') {
            const modal = new ModalBuilder()
                .setCustomId('modal_calculo')
                .setTitle('💰 Calculadora de Robux');

            const robuxInput = new TextInputBuilder()
                .setCustomId('robux_amount')
                .setLabel('💰 Quantos Robux?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 100, 500, 1000')
                .setRequired(true);

            const metodoInput = new TextInputBuilder()
                .setCustomId('metodo_select')
                .setLabel('📦 Método (gamepass ou grupo)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Digite: gamepass ou grupo')
                .setRequired(true);

            const firstRow = new ActionRowBuilder().addComponents(robuxInput);
            const secondRow = new ActionRowBuilder().addComponents(metodoInput);
            modal.addComponents(firstRow, secondRow);
            await interaction.showModal(modal);
        }
        
        // COMANDO /anunciar
        if (interaction.commandName === 'anunciar') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({ content: '❌ Apenas staff pode usar este comando.', flags: 64 });
            }

            const canal = interaction.options.getChannel('canal') || interaction.channel;
            const titulo = interaction.options.getString('titulo') || '📢 ANÚNCIO ROBUX BRASIL';
            const cor = interaction.options.getString('cor') || 'verde';
            const imagemUrl = interaction.options.getString('imagem');

            const modal = new ModalBuilder()
                .setCustomId(`modal_anuncio_${interaction.id}`)
                .setTitle('✏️ Escreva seu anúncio');

            const mensagemInput = new TextInputBuilder()
                .setCustomId('mensagem')
                .setLabel('📝 Conteúdo do anúncio')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Digite seu anúncio aqui...')
                .setRequired(true)
                .setMaxLength(4000);

            const row = new ActionRowBuilder().addComponents(mensagemInput);
            modal.addComponents(row);

            client.tempData = client.tempData || {};
            client.tempData[interaction.id] = {
                canal: canal.id,
                titulo: titulo,
                cor: cor,
                imagem: imagemUrl,
                usuario: interaction.user.id
            };

            await interaction.showModal(modal);
        }
        
        // ==================== COMANDOS DE AFILIADO ====================
        
        if (interaction.commandName === 'afiliado') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ter o cargo de afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            let affiliate = affiliates.getAffiliate(interaction.user.id);
            
            if (!affiliate) {
                affiliate = affiliates.registerAffiliate(interaction.user.id, interaction.user.username);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Você agora é um afiliado!')
                    .setDescription(`
**Como funciona:**
1. Crie um link de convite manualmente no Discord (botão direito no canal → "Criar Convite")
2. Use o comando \`/registrarlink link: https://discord.gg/xxxxx\` para registrar o link
3. Compartilhe o link com seus amigos
4. Quando alguém entrar pelo seu link e comprar acima de 400 Robux **ou uma Gamepass**, você ganha **10% da venda!**
5. Use \`/saldo\` para ver quanto você tem disponível para saque
6. Use \`/sacar\` para solicitar saque (mínimo R$ 30)

Use \`/meuslinks\` para ver seus links registrados.
Use \`/minhasvendas\` para acompanhar seus ganhos.
                    `)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Robux Brasil' });
                await interaction.reply({ embeds: [embed], flags: 64 });
            } else {
                await interaction.reply({
                    content: '✅ Você já é um afiliado! Use `/registrarlink` para adicionar links.',
                    flags: 64
                });
            }
        }
        
        if (interaction.commandName === 'registrarlink') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado. Use `/afiliado` para se tornar um!',
                    flags: 64
                });
            }
            
            const link = interaction.options.getString('link');
            const codeMatch = link.match(/discord\.gg\/([a-zA-Z0-9]+)/);
            if (!codeMatch) {
                return interaction.reply({
                    content: '❌ Link inválido. Use um link como: https://discord.gg/abc123',
                    flags: 64
                });
            }
            
            const inviteCode = codeMatch[1];
            const existingLinks = affiliates.getAffiliateLinks(interaction.user.id);
            if (existingLinks.some(l => l.code === inviteCode)) {
                return interaction.reply({
                    content: '❌ Este link já está registrado para você.',
                    flags: 64
                });
            }
            
            try {
                const invites = await interaction.guild.invites.fetch();
                const invite = invites.get(inviteCode);
                if (!invite) {
                    return interaction.reply({
                        content: '❌ Link não encontrado no servidor. Certifique-se que o link é válido.',
                        flags: 64
                    });
                }
                
                affiliates.addInviteLink(interaction.user.id, inviteCode, invite.url);
                await updateInviteCache(interaction.guild);
                
                const embed = new EmbedBuilder()
                    .setTitle('🔗 Link registrado com sucesso!')
                    .setDescription(`
**Link:** \`${invite.url}\`
**Código:** \`${inviteCode}\`

Agora compartilhe este link com seus amigos! Quando alguém entrar pelo link, será registrado automaticamente.
                    `)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Robux Brasil' });
                
                await interaction.reply({ embeds: [embed], flags: 64 });
            } catch (error) {
                console.error(error);
                await interaction.reply({
                    content: '❌ Erro ao verificar o link. Certifique-se que o link é válido.',
                    flags: 64
                });
            }
        }
        
        if (interaction.commandName === 'meuslinks') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado. Use `/afiliado` para se tornar um!',
                    flags: 64
                });
            }
            
            const links = affiliates.getAffiliateLinks(interaction.user.id);
            if (links.length === 0) {
                return interaction.reply({
                    content: '📭 Você ainda não tem nenhum link registrado. Crie um convite manualmente no Discord e use `/registrarlink link: URL`',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🔗 Seus Links de Afiliado')
                .setDescription(links.map((link, index) => 
                    `**${index + 1}.** \`${link.url}\`\n📊 Usos: ${link.uses}\n📅 Registrado em: ${new Date(link.createdAt).toLocaleString()}`
                ).join('\n\n'))
                .setColor(0x00FF00)
                .setFooter({ text: 'Use /deletarlink codigo:XXXX para remover um link' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        if (interaction.commandName === 'deletarlink') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado.',
                    flags: 64
                });
            }
            
            const codigo = interaction.options.getString('codigo');
            const success = affiliates.removeInviteLink(interaction.user.id, codigo);
            if (!success) {
                return interaction.reply({
                    content: '❌ Link não encontrado. Use `/meuslinks` para ver seus links.',
                    flags: 64
                });
            }
            
            await interaction.reply({
                content: `✅ Link com código \`${codigo}\` removido com sucesso!`,
                flags: 64
            });
        }
        
        if (interaction.commandName === 'minhasvendas') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado. Use `/afiliado` para se tornar um!',
                    flags: 64
                });
            }
            
            let comprasRealizadas = 0;
            if (affiliate.clicks) {
                comprasRealizadas = Object.values(affiliate.clicks).filter(c => c.purchased).length;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Suas Vendas como Afiliado')
                .setDescription(`
**Total de vendas:** ${affiliate.totalSales || 0}
**Comissão total:** R$ ${(affiliate.totalCommission || 0).toFixed(2)}
**Pessoas que entraram pelos seus links:** ${affiliate.clicks ? Object.keys(affiliate.clicks).length : 0}
**Compras realizadas:** ${comprasRealizadas}
**Links ativos:** ${affiliate.links ? affiliate.links.length : 0}
                `)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        if (interaction.commandName === 'saldo') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado. Use `/afiliado` para se tornar um!',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('💰 Seu Saldo')
                .setDescription(`
**Saldo disponível:** R$ ${(affiliate.availableBalance || 0).toFixed(2)}
**Total já recebido:** R$ ${(affiliate.totalCommission || 0).toFixed(2)}

💡 **Saque mínimo:** R$ 30,00
💡 Use \`/sacar\` para solicitar saque
                `)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        if (interaction.commandName === 'sacar') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado. Use `/afiliado` para se tornar um!',
                    flags: 64
                });
            }
            
            const metodo = interaction.options.getString('metodo');
            const valorStr = interaction.options.getString('valor');
            const valor = parseFloat(valorStr.replace(',', '.'));
            
            if (isNaN(valor) || valor < 30) {
                return interaction.reply({
                    content: '❌ O valor mínimo para saque é R$ 30,00.',
                    flags: 64
                });
            }
            
            if ((affiliate.availableBalance || 0) < valor) {
                return interaction.reply({
                    content: `❌ Saldo insuficiente. Seu saldo atual é R$ ${(affiliate.availableBalance || 0).toFixed(2)}.`,
                    flags: 64
                });
            }
            
            const modal = new ModalBuilder()
                .setCustomId(`modal_saque_${interaction.id}`)
                .setTitle(metodo === 'dinheiro' ? '💰 Saque via Pix' : '🎮 Saque em Robux');
            
            let infoInput;
            if (metodo === 'dinheiro') {
                infoInput = new TextInputBuilder()
                    .setCustomId('pix_key')
                    .setLabel('📱 Chave Pix (CPF/Email/Telefone)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Digite sua chave Pix')
                    .setRequired(true);
            } else {
                infoInput = new TextInputBuilder()
                    .setCustomId('robux_user')
                    .setLabel('🎮 Usuário Roblox')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Digite seu usuário do Roblox')
                    .setRequired(true);
            }
            
            const row = new ActionRowBuilder().addComponents(infoInput);
            modal.addComponents(row);
            
            client.tempWithdrawal = client.tempWithdrawal || {};
            client.tempWithdrawal[interaction.id] = {
                valor: valor,
                metodo: metodo,
                userId: interaction.user.id
            };
            
            await interaction.showModal(modal);
        }
        
        if (interaction.commandName === 'historico') {
            if (!hasAffiliateRole(interaction.member)) {
                return interaction.reply({
                    content: '❌ Você precisa ser afiliado para usar este comando.',
                    flags: 64
                });
            }
            
            const withdrawals = affiliates.getAffiliateWithdrawals(interaction.user.id);
            if (withdrawals.length === 0) {
                return interaction.reply({
                    content: '📭 Você ainda não fez nenhum pedido de saque.',
                    flags: 64
                });
            }
            
            const statusEmoji = {
                pending: '⏳ Pendente',
                confirmed: '✅ Confirmado',
                rejected: '❌ Rejeitado'
            };
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Histórico de Saques')
                .setDescription(withdrawals.map(w => 
                    `**${new Date(w.date).toLocaleString()}**\nValor: R$ ${w.amount.toFixed(2)} | Método: ${w.method === 'dinheiro' ? 'Pix' : 'Robux'} | Status: ${statusEmoji[w.status]}`
                ).join('\n\n'))
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        if (interaction.commandName === 'saquespendentes') {
            if (interaction.user.id !== config.ownerId) {
                return interaction.reply({
                    content: '❌ Apenas o dono do bot pode usar este comando.',
                    flags: 64
                });
            }
            
            const pendingWithdrawals = affiliates.listPendingWithdrawals();
            if (pendingWithdrawals.length === 0) {
                return interaction.reply({
                    content: '📭 Nenhum saque pendente.',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('⏳ Saques Pendentes')
                .setDescription(pendingWithdrawals.map(w => 
                    `**ID:** \`${w.id}\`\n**Afiliado:** <@${w.affiliateId}>\n**Valor:** R$ ${w.amount.toFixed(2)}\n**Método:** ${w.method === 'dinheiro' ? 'Pix' : 'Robux'}\n**Info:** ${w.method === 'dinheiro' ? w.pixKey : w.robuxUsername}\n**Data:** ${new Date(w.date).toLocaleString()}\n---`
                ).join('\n'))
                .setColor(0xFFA500)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        if (interaction.commandName === 'afiliados') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({ content: '❌ Apenas staff pode usar este comando.', flags: 64 });
            }
            
            const allAffiliates = affiliates.listAffiliates();
            if (allAffiliates.length === 0) {
                return interaction.reply({ content: '📭 Nenhum afiliado cadastrado ainda.', flags: 64 });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Lista de Afiliados')
                .setDescription(allAffiliates.map(aff => 
                    `**${aff.username}**\n📊 Vendas: ${aff.totalSales} | 💰 Comissão: R$ ${aff.totalCommission.toFixed(2)} | 👥 Entradas: ${aff.clicksCount} | 🔗 Links: ${aff.linksCount} | 💰 Saldo: R$ ${aff.availableBalance.toFixed(2)}`
                ).join('\n\n'))
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
        
        if (interaction.commandName === 'pendentes') {
            if (interaction.user.id !== config.ownerId) {
                return interaction.reply({
                    content: '❌ Apenas o dono do bot pode usar este comando.',
                    flags: 64
                });
            }
            
            const pendingSales = affiliates.listPendingSales();
            if (pendingSales.length === 0) {
                return interaction.reply({
                    content: '📭 Nenhuma venda pendente.',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('⏳ Vendas Pendentes')
                .setDescription(pendingSales.map(sale => 
                    `**ID:** \`${sale.id}\`\n**Cliente:** <@${sale.buyerId}>\n**Robux:** ${sale.robuxAmount}\n**Comissão:** R$ ${sale.commission.toFixed(2)}\n**Afiliado:** ${sale.affiliateId ? `<@${sale.affiliateId}>` : 'Nenhum'}\n**Data:** ${new Date(sale.date).toLocaleString()}\n---`
                ).join('\n'))
                .setColor(0xFFA500)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
    }
    
    // ==================== MODAIS ====================
    if (interaction.isModalSubmit()) {
        
        if (interaction.customId === 'modal_calculo') {
            const robux = interaction.fields.getTextInputValue('robux_amount');
            const metodo = interaction.fields.getTextInputValue('metodo_select');
            
            const result = calculateRobux(parseInt(robux), metodo);
            if (!result) {
                return interaction.reply({
                    content: '❌ Erro ao calcular. Use gamepass ou grupo.',
                    flags: 64
                });
            }
            
            const embed = generateCalculationEmbed(result);
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        
        if (interaction.customId.startsWith('modal_anuncio_')) {
            const anuncioId = interaction.customId.replace('modal_anuncio_', '');
            const tempData = client.tempData?.[anuncioId];

            if (!tempData || tempData.usuario !== interaction.user.id) {
                return interaction.reply({ content: '❌ Erro ao processar anúncio.', flags: 64 });
            }

            const mensagem = interaction.fields.getTextInputValue('mensagem');
            const canal = await client.channels.fetch(tempData.canal);
            const titulo = tempData.titulo;
            const imagemUrl = tempData.imagem;

            const cores = { 'verde': 0x00FF00, 'vermelho': 0xFF0000, 'azul': 0x0000FF, 'amarelo': 0xFFFF00, 'laranja': 0xFFA500, 'roxo': 0x800080, 'rosa': 0xFF69B4, 'cinza': 0x808080 };
            const corHex = cores[tempData.cor.toLowerCase()] || 0x00FF00;

            const embed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(mensagem)
                .setColor(corHex)
                .setFooter({ text: 'Robux Brasil' })
                .setTimestamp();

            if (imagemUrl) embed.setImage(imagemUrl);

            await canal.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ Anúncio enviado em ${canal}!`, flags: 64 });
            delete client.tempData[anuncioId];
        }
        
        if (interaction.customId === 'modal_ticket_info') {
            const robux = interaction.fields.getTextInputValue('robux_amount');
            const payment = interaction.fields.getTextInputValue('payment_method');
            const methodDisplay = interaction.fields.getTextInputValue('purchase_method');
            
            let method = '';
            if (methodDisplay.includes('Gamepass')) method = 'gamepass';
            else if (methodDisplay.includes('Grupo')) method = 'grupo';
            else return interaction.reply({ content: '❌ Método inválido.', flags: 64 });

            await createTicket(interaction, { type: 'compra', robux: robux, payment: payment, method: method });
        }
        
        if (interaction.customId === 'modal_gift_info') {
            const game = interaction.fields.getTextInputValue('game');
            const gamepasses = interaction.fields.getTextInputValue('gamepasses');
            const payment = interaction.fields.getTextInputValue('payment_method');

            await createTicket(interaction, { 
                type: 'gift', 
                game: game, 
                gamepasses: gamepasses, 
                payment: payment 
            });
        }
        
        if (interaction.customId === 'modal_support_info') {
            const assunto = interaction.fields.getTextInputValue('assunto');
            await createTicket(interaction, { type: 'suporte', assunto: assunto });
        }
        
        if (interaction.customId.startsWith('modal_saque_')) {
            const tempId = interaction.customId.replace('modal_saque_', '');
            const tempData = client.tempWithdrawal?.[tempId];
            
            if (!tempData || tempData.userId !== interaction.user.id) {
                return interaction.reply({ content: '❌ Erro ao processar saque.', flags: 64 });
            }
            
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            if (!affiliate) {
                return interaction.reply({ content: '❌ Afiliado não encontrado.', flags: 64 });
            }
            
            let pixKey = null;
            let robuxUsername = null;
            
            if (tempData.metodo === 'dinheiro') {
                pixKey = interaction.fields.getTextInputValue('pix_key');
            } else {
                robuxUsername = interaction.fields.getTextInputValue('robux_user');
            }
            
            const withdrawal = affiliates.registerWithdrawal(
                interaction.user.id,
                tempData.valor,
                tempData.metodo,
                pixKey,
                robuxUsername
            );
            
            if (!withdrawal) {
                return interaction.reply({
                    content: '❌ Erro ao registrar saque. Verifique seu saldo.',
                    flags: 64
                });
            }
            
            const category = interaction.guild.channels.cache.get(config.ticketCategory);
            if (category) {
                const ticketNumber = getNextTicketNumber();
                const channelName = `saque-${ticketNumber.toString().padStart(2, '0')}`;
                
                const ticketChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: config.ticketCategory,
                    topic: interaction.user.id,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: config.staffRole, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                    ]
                });
                
                const metodoNome = tempData.metodo === 'dinheiro' ? '💰 Dinheiro (Pix)' : '🎮 Robux';
                const info = tempData.metodo === 'dinheiro' ? `**Chave Pix:** ${pixKey}` : `**Usuário Roblox:** ${robuxUsername}`;
                const valorRobux = tempData.metodo === 'robux' ? `\n**Robux a receber:** ${Math.floor((tempData.valor / 30) * 1000)}` : '';
                
                const embed = new EmbedBuilder()
                    .setTitle('💰 PEDIDO DE SAQUE PENDENTE')
                    .setDescription(`
**Afiliado:** <@${interaction.user.id}>
**Valor:** R$ ${tempData.valor.toFixed(2)}
**Método:** ${metodoNome}
${info}${valorRobux}

Aguardando confirmação do dono.
                    `)
                    .setColor(0xFFA500)
                    .setTimestamp();
                
                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_withdrawal_${withdrawal.id}`)
                        .setLabel('✅ Confirmar Saque')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_withdrawal_${withdrawal.id}`)
                        .setLabel('❌ Rejeitar Saque')
                        .setStyle(ButtonStyle.Danger)
                );
                
                await ticketChannel.send({
                    content: `<@${config.ownerId}>`,
                    embeds: [embed],
                    components: [confirmRow]
                });
                
                await interaction.reply({
                    content: `✅ Pedido de saque registrado! Um ticket foi criado: ${ticketChannel}\nAguardando confirmação do dono.`,
                    flags: 64
                });
            } else {
                await interaction.reply({
                    content: `✅ Pedido de saque registrado! Valor: R$ ${tempData.valor.toFixed(2)}. Aguarde a confirmação do dono.`,
                    flags: 64
                });
            }
            
            delete client.tempWithdrawal[tempId];
        }
        
        // Modal de preço do gift (aparece quando fecham um ticket de gift)
        if (interaction.customId.startsWith('modal_gift_price_')) {
            const channelId = interaction.customId.replace('modal_gift_price_', '');
            const temp = client.tempGiftPrice?.[channelId];
            if (!temp) return;

            const robuxPrice = parseInt(interaction.fields.getTextInputValue('robux_price'));
            if (isNaN(robuxPrice) || robuxPrice <= 0) {
                return interaction.reply({ content: '❌ Valor inválido. Tente novamente.', flags: 64 });
            }

            // Calcular preço em reais (R$ 29,99 por 1k Robux)
            const priceInReais = (robuxPrice / 1000) * 29.99;
            const commission = priceInReais * 0.10;

            // Registrar venda pendente
            const pendingSale = affiliates.registerPendingSale(
                temp.buyerId,
                temp.buyerUsername,
                robuxPrice,
                temp.ticketChannelId,
                temp.staffWhoClosed
            );
            
            // Ajustar os valores manualmente no arquivo
            const data = affiliates.load();
            const idx = data.pendingSales.findIndex(s => s.id === pendingSale.id);
            if (idx !== -1) {
                data.pendingSales[idx].price = priceInReais;
                data.pendingSales[idx].commission = commission;
                affiliates.save(data);
            }

            // Enviar mensagem de confirmação para o dono
            const owner = await client.users.fetch(config.ownerId);
            const confirmEmbed = new EmbedBuilder()
                .setTitle('💰 VENDA PENDENTE - CONFIRMAÇÃO NECESSÁRIA')
                .setDescription(`**Cliente:** <@${temp.buyerId}>\n**Tipo:** 🎁 Gift Gamepass\n**Robux:** ${robuxPrice}\n**Valor:** R$ ${priceInReais.toFixed(2)}\n**Afiliado:** ${pendingSale.affiliateId ? `<@${pendingSale.affiliateId}>` : 'Nenhum'}\n**Comissão:** R$ ${commission.toFixed(2)}\n**Ticket:** ${interaction.channel.name}\n**Staff:** ${temp.staffWhoClosed}`)
                .setColor(0xFFA500)
                .setTimestamp();
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`confirm_sale_${pendingSale.id}`).setLabel('✅ Confirmar Venda').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_sale_${pendingSale.id}`).setLabel('❌ Rejeitar Venda').setStyle(ButtonStyle.Danger)
            );
            await owner.send({ embeds: [confirmEmbed], components: [confirmRow] }).catch(() => {});

            // Responder ao staff que fechou o ticket
            await interaction.reply({ content: `✅ Venda registrada! Ticket será fechado.`, flags: 64 });

            // Fechar o ticket
            const ticketChannel = await client.channels.fetch(channelId);
            if (ticketChannel) await ticketChannel.delete().catch(console.error);

            delete client.tempGiftPrice[channelId];
        }
    }
    
    // ==================== BOTÕES ====================
    if (interaction.isButton()) {
        
        if (interaction.customId === 'support_ticket') {
            await showSupportModal(interaction);
        }
        
        if (interaction.customId === 'buy_gamepass') {
            await showPurchaseModal(interaction, 'gamepass');
        }
        
        if (interaction.customId === 'buy_group') {
            await showPurchaseModal(interaction, 'grupo');
        }
        
        if (interaction.customId === 'buy_gift') {
            await showGiftModal(interaction);
        }
        
        if (interaction.customId === 'claim_ticket') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({ content: '❌ Apenas staff pode assumir.', flags: 64 });
            }
            if (interaction.channel.name.includes('assumido')) {
                return interaction.reply({ content: '⚠️ Ticket já assumido.', flags: 64 });
            }
            const newName = `assumido-${interaction.channel.name}`;
            await interaction.channel.setName(newName);
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Ticket Assumido')
                .setDescription(`Atendente: **${interaction.user.tag}**`)
                .setColor(0x00FF00)
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        
        if (interaction.customId === 'close_ticket') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({ content: '❌ Apenas staff pode fechar.', flags: 64 });
            }

            // Primeiro, buscar a mensagem do ticket para ver se é gift
            const ticketMessages = await interaction.channel.messages.fetch({ limit: 50 });
            const embedMessage = ticketMessages.find(m => m.embeds[0]?.title === '🎫 Ticket de Compra' || m.embeds[0]?.title === '🎁 Ticket de Gift');
            
            // Se for gift, não damos deferReply – mostramos o modal imediatamente
            if (embedMessage && embedMessage.embeds[0]?.title === '🎁 Ticket de Gift') {
                // Obter dados do cliente
                let buyerUsername = '';
                const description = embedMessage.embeds[0].description;
                const userMatch = description.match(/<@!?(\d+)>/);
                if (userMatch) {
                    try {
                        const user = await client.users.fetch(userMatch[1]);
                        buyerUsername = user.username;
                    } catch (e) {}
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_gift_price_${interaction.channel.id}`)
                    .setTitle('💰 Informe o valor do Gift');

                const priceInput = new TextInputBuilder()
                    .setCustomId('robux_price')
                    .setLabel('Valor em Robux (ex: 500)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Quantos Robux custa esta gamepass?')
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(priceInput);
                modal.addComponents(row);

                client.tempGiftPrice = client.tempGiftPrice || {};
                client.tempGiftPrice[interaction.channel.id] = {
                    buyerId: interaction.channel.topic,
                    buyerUsername: buyerUsername,
                    ticketChannelId: interaction.channel.id,
                    staffWhoClosed: interaction.user.tag
                };

                await interaction.showModal(modal);
                return; // Não fecha o ticket agora – o modal cuidará disso
            }
            
            // Se não for gift, procede com o deferReply e fechamento normal
            await interaction.deferReply();
            
            try {
                let claimedBy = 'Ninguém';
                const messages = await interaction.channel.messages.fetch({ limit: 10 });
                const claimMessage = messages.find(m => m.embeds[0]?.title === '🛡️ Ticket Assumido');
                if (claimMessage) {
                    const match = claimMessage.embeds[0].description.match(/\*\*(.+?)\*\*/);
                    if (match) claimedBy = match[1];
                }

                const transcriptPath = await generateTranscript(interaction.channel, interaction.user.tag, claimedBy);
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Fechado')
                    .setDescription(`**Ticket:** ${interaction.channel.name}\n**Cliente:** <@${interaction.channel.topic}>\n**Atendente:** ${claimedBy}\n**Fechado por:** ${interaction.user.tag}`)
                    .setColor(0xFF0000)
                    .setTimestamp();
                const logChannel = interaction.guild.channels.cache.get(config.logChannel);
                if (logChannel) await logChannel.send({ embeds: [logEmbed], files: [transcriptPath] });

                // Detectar compra (apenas Robux aqui, pois gift já foi tratado)
                let robuxAmount = 0;
                let buyerUsername = '';
                let wasPurchase = false;
                if (embedMessage && embedMessage.embeds[0] && embedMessage.embeds[0].title === '🎫 Ticket de Compra') {
                    wasPurchase = true;
                    const description = embedMessage.embeds[0].description;
                    const robuxMatch = description.match(/\*\*💰 Quantidade:\*\* (\d+) Robux/);
                    if (robuxMatch) robuxAmount = parseInt(robuxMatch[1]);
                    const userMatch = description.match(/<@!?(\d+)>/);
                    if (userMatch) {
                        try {
                            const user = await client.users.fetch(userMatch[1]);
                            buyerUsername = user.username;
                        } catch (e) {}
                    }
                }
                
                if (wasPurchase && robuxAmount > 0) {
                    const price = (robuxAmount / 1000) * 45.90;
                    const commission = price * 0.10;
                    const pendingSale = affiliates.registerPendingSale(
                        interaction.channel.topic,
                        buyerUsername,
                        robuxAmount,
                        interaction.channel.id,
                        interaction.user.tag
                    );
                    const owner = await client.users.fetch(config.ownerId);
                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('💰 VENDA PENDENTE - CONFIRMAÇÃO NECESSÁRIA')
                        .setDescription(`**Cliente:** <@${interaction.channel.topic}>\n**Tipo:** 🎮 Robux\n**Robux:** ${robuxAmount}\n**Valor:** R$ ${price.toFixed(2)}\n**Afiliado:** ${pendingSale.affiliateId ? `<@${pendingSale.affiliateId}>` : 'Nenhum'}\n**Comissão:** R$ ${commission.toFixed(2)}\n**Ticket:** ${interaction.channel.name}\n**Staff:** ${interaction.user.tag}`)
                        .setColor(0xFFA500)
                        .setTimestamp();
                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`confirm_sale_${pendingSale.id}`).setLabel('✅ Confirmar Venda').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`reject_sale_${pendingSale.id}`).setLabel('❌ Rejeitar Venda').setStyle(ButtonStyle.Danger)
                    );
                    await owner.send({ embeds: [confirmEmbed], components: [confirmRow] }).catch(() => {});
                    await interaction.editReply({ content: `✅ Ticket finalizado. Venda registrada para confirmação do dono.` });
                } else {
                    await interaction.editReply({ content: '✅ Ticket finalizado.' });
                }

                // Avaliação
                const clientId = interaction.channel.topic;
                if (clientId) {
                    try {
                        const user = await client.users.fetch(clientId);
                        const reviewButtons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`review_1_${interaction.channel.id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`review_2_${interaction.channel.id}`).setLabel('⭐⭐ 2').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`review_3_${interaction.channel.id}`).setLabel('⭐⭐⭐ 3').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`review_4_${interaction.channel.id}`).setLabel('⭐⭐⭐⭐ 4').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`review_5_${interaction.channel.id}`).setLabel('⭐⭐⭐⭐⭐ 5').setStyle(ButtonStyle.Success)
                        );
                        const reviewEmbed = new EmbedBuilder()
                            .setTitle('⭐ Avalie seu atendimento')
                            .setDescription('Olá! Seu atendimento foi finalizado.\n\n**Como você avalia o atendimento que recebeu?**')
                            .setColor(0x00FF00)
                            .setFooter({ text: 'Robux Brasil' })
                            .setTimestamp();
                        await user.send({ embeds: [reviewEmbed], components: [reviewButtons] }).catch(() => {});
                    } catch (err) {}
                }

                setTimeout(() => interaction.channel.delete().catch(console.error), 3000);
                
            } catch (error) {
                console.error('Erro ao fechar ticket:', error);
                await interaction.editReply({ content: '❌ Erro ao finalizar.' });
            }
        }
        
        // Botões de confirmação de venda
        if (interaction.customId.startsWith('confirm_sale_')) {
            if (interaction.user.id !== config.ownerId) return interaction.reply({ content: '❌ Apenas o dono do bot pode confirmar vendas.', flags: 64 });
            const saleId = interaction.customId.replace('confirm_sale_', '');
            const sale = affiliates.confirmSale(saleId);
            if (!sale) return interaction.reply({ content: '❌ Venda não encontrada.', flags: 64 });
            const embed = new EmbedBuilder()
                .setTitle('✅ Venda Confirmada!')
                .setDescription(`**Cliente:** <@${sale.buyerId}>\n**Robux:** ${sale.robuxAmount}\n**Valor:** R$ ${sale.price.toFixed(2)}\n**Afiliado:** ${sale.affiliateId ? `<@${sale.affiliateId}>` : 'Nenhum'}\n**Comissão:** R$ ${sale.commission.toFixed(2)}`)
                .setColor(0x00FF00)
                .setTimestamp();
            await interaction.update({ embeds: [embed], components: [] });
            if (sale.affiliateId) {
                try {
                    const affiliateUser = await client.users.fetch(sale.affiliateId);
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('💰 Comissão Confirmada!')
                        .setDescription(`Você recebeu uma comissão de **R$ ${sale.commission.toFixed(2)}**!\n- **Cliente:** ${sale.buyerUsername}\n- **Robux comprados:** ${sale.robuxAmount}`)
                        .setColor(0x00FF00)
                        .setTimestamp();
                    await affiliateUser.send({ embeds: [dmEmbed] }).catch(() => {});
                } catch (e) {}
            }
        }
        
        if (interaction.customId.startsWith('reject_sale_')) {
            if (interaction.user.id !== config.ownerId) return interaction.reply({ content: '❌ Apenas o dono do bot pode rejeitar vendas.', flags: 64 });
            const saleId = interaction.customId.replace('reject_sale_', '');
            const sale = affiliates.rejectSale(saleId);
            if (!sale) return interaction.reply({ content: '❌ Venda não encontrada.', flags: 64 });
            const embed = new EmbedBuilder()
                .setTitle('❌ Venda Rejeitada')
                .setDescription(`**Cliente:** <@${sale.buyerId}>\n**Robux:** ${sale.robuxAmount}\n**Motivo:** Venda não confirmada pelo dono.`)
                .setColor(0xFF0000)
                .setTimestamp();
            await interaction.update({ embeds: [embed], components: [] });
        }
        
        // Botões de confirmação de saque
        if (interaction.customId.startsWith('confirm_withdrawal_')) {
            if (interaction.user.id !== config.ownerId) return interaction.reply({ content: '❌ Apenas o dono do bot pode confirmar saques.', flags: 64 });
            const withdrawalId = interaction.customId.replace('confirm_withdrawal_', '');
            const withdrawal = affiliates.confirmWithdrawal(withdrawalId);
            if (!withdrawal) return interaction.reply({ content: '❌ Saque não encontrado.', flags: 64 });
            const embed = new EmbedBuilder()
                .setTitle('✅ Saque Confirmado!')
                .setDescription(`
**Afiliado:** <@${withdrawal.affiliateId}>
**Valor:** R$ ${withdrawal.amount.toFixed(2)}
**Método:** ${withdrawal.method === 'dinheiro' ? '💰 Dinheiro (Pix)' : '🎮 Robux'}
${withdrawal.method === 'dinheiro' ? `**Chave Pix:** ${withdrawal.pixKey}` : `**Usuário Roblox:** ${withdrawal.robuxUsername}`}
${withdrawal.method === 'robux' ? `**Robux enviados:** ${withdrawal.robuxAmount}` : ''}

Saque confirmado e processado.
                `)
                .setColor(0x00FF00)
                .setTimestamp();
            await interaction.update({ embeds: [embed], components: [] });
            try {
                const affiliateUser = await client.users.fetch(withdrawal.affiliateId);
                const dmEmbed = new EmbedBuilder()
                    .setTitle('💰 Saque Confirmado!')
                    .setDescription(`
Seu saque de **R$ ${withdrawal.amount.toFixed(2)}** foi confirmado!
${withdrawal.method === 'dinheiro' ? `O valor será enviado para sua chave Pix: ${withdrawal.pixKey}` : `Você receberá ${withdrawal.robuxAmount} Robux no usuário: ${withdrawal.robuxUsername}`}

Obrigado por fazer parte do nosso programa de afiliados!
                    `)
                    .setColor(0x00FF00)
                    .setTimestamp();
                await affiliateUser.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch (e) {}
        }
        
        if (interaction.customId.startsWith('reject_withdrawal_')) {
            if (interaction.user.id !== config.ownerId) return interaction.reply({ content: '❌ Apenas o dono do bot pode rejeitar saques.', flags: 64 });
            const withdrawalId = interaction.customId.replace('reject_withdrawal_', '');
            const withdrawal = affiliates.rejectWithdrawal(withdrawalId);
            if (!withdrawal) return interaction.reply({ content: '❌ Saque não encontrado.', flags: 64 });
            const embed = new EmbedBuilder()
                .setTitle('❌ Saque Rejeitado')
                .setDescription(`
**Afiliado:** <@${withdrawal.affiliateId}>
**Valor:** R$ ${withdrawal.amount.toFixed(2)}
**Motivo:** Saque não confirmado pelo dono.

O valor foi devolvido ao seu saldo.
                `)
                .setColor(0xFF0000)
                .setTimestamp();
            await interaction.update({ embeds: [embed], components: [] });
            try {
                const affiliateUser = await client.users.fetch(withdrawal.affiliateId);
                const dmEmbed = new EmbedBuilder()
                    .setTitle('❌ Saque Rejeitado')
                    .setDescription(`
Seu saque de **R$ ${withdrawal.amount.toFixed(2)}** foi rejeitado.

O valor foi devolvido ao seu saldo. Entre em contato com o suporte para mais informações.
                    `)
                    .setColor(0xFF0000)
                    .setTimestamp();
                await affiliateUser.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch (e) {}
        }
        
        if (interaction.customId.startsWith('review_')) {
            const parts = interaction.customId.split('_');
            const rating = parseInt(parts[1]);
            const channelId = parts[2];
            const starNames = { 1: '⭐ 1 Estrela', 2: '⭐⭐ 2 Estrelas', 3: '⭐⭐⭐ 3 Estrelas', 4: '⭐⭐⭐⭐ 4 Estrelas', 5: '⭐⭐⭐⭐⭐ 5 Estrelas' };
            
            let ticketName = 'Desconhecido';
            try {
                const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
                if (ticketChannel) ticketName = ticketChannel.name;
            } catch (e) {}
            
            const reviewChannel = client.channels.cache.get(config.reviewChannel);
            if (reviewChannel) {
                const reviewEmbed = new EmbedBuilder()
                    .setTitle('📝 Nova Avaliação')
                    .setDescription(`**Cliente:** <@${interaction.user.id}>\n**Ticket:** ${ticketName}\n**Avaliação:** ${starNames[rating]}`)
                    .setColor(rating >= 4 ? 0x00FF00 : rating === 3 ? 0xFFA500 : 0xFF0000)
                    .setTimestamp();
                await reviewChannel.send({ embeds: [reviewEmbed] });
            }
            await interaction.reply({ content: `✅ Obrigado pela avaliação! Você deu **${starNames[rating]}**.`, flags: 64 });
            const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('disabled').setLabel('⭐ Avaliação registrada').setStyle(ButtonStyle.Secondary).setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
        }
    }
});

// ==================== FUNÇÕES AUXILIARES ====================
async function showSupportModal(interaction) {
    const category = interaction.guild.channels.cache.get(config.ticketCategory);
    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: '❌ Erro de configuração.', flags: 64 });
    }
    const userTickets = interaction.guild.channels.cache.filter(c => c.parentId === config.ticketCategory && c.topic === interaction.user.id);
    if (userTickets.size >= 2) {
        return interaction.reply({ content: '❌ Você já atingiu o limite de **2 tickets abertos**.', flags: 64 });
    }
    const modal = new ModalBuilder()
        .setCustomId('modal_support_info')
        .setTitle('🎫 Abrir Ticket de Suporte');
    const assuntoInput = new TextInputBuilder()
        .setCustomId('assunto')
        .setLabel('📋 Assunto')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Descreva o que você precisa...')
        .setRequired(true)
        .setMaxLength(500);
    const row = new ActionRowBuilder().addComponents(assuntoInput);
    modal.addComponents(row);
    await interaction.showModal(modal);
}

async function showPurchaseModal(interaction, method) {
    const category = interaction.guild.channels.cache.get(config.ticketCategory);
    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: '❌ Erro de configuração.', flags: 64 });
    }
    const userTickets = interaction.guild.channels.cache.filter(c => c.parentId === config.ticketCategory && c.topic === interaction.user.id);
    if (userTickets.size >= 2) {
        return interaction.reply({ content: '❌ Você já atingiu o limite de **2 tickets abertos**.', flags: 64 });
    }
    const modal = new ModalBuilder()
        .setCustomId('modal_ticket_info')
        .setTitle(method === 'gamepass' ? '🎮 Compra via Gamepass' : '👥 Compra via Grupo');
    const methodInput = new TextInputBuilder()
        .setCustomId('purchase_method')
        .setLabel('📦 Método')
        .setStyle(TextInputStyle.Short)
        .setValue(method === 'gamepass' ? 'Gamepass - R$ 45,90/1k' : 'Grupo - R$ 29,99/1k')
        .setRequired(true);
    const robuxInput = new TextInputBuilder()
        .setCustomId('robux_amount')
        .setLabel('💰 Quantos Robux?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 100, 500, 1000')
        .setRequired(true);
    const paymentInput = new TextInputBuilder()
        .setCustomId('payment_method')
        .setLabel('💳 Pagamento')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Pix ou Criptomoedas')
        .setRequired(true);
    const methodRow = new ActionRowBuilder().addComponents(methodInput);
    const firstRow = new ActionRowBuilder().addComponents(robuxInput);
    const secondRow = new ActionRowBuilder().addComponents(paymentInput);
    modal.addComponents(methodRow, firstRow, secondRow);
    await interaction.showModal(modal);
}

async function showGiftModal(interaction) {
    const category = interaction.guild.channels.cache.get(config.ticketCategory);
    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: '❌ Erro de configuração.', flags: 64 });
    }
    const userTickets = interaction.guild.channels.cache.filter(c => c.parentId === config.ticketCategory && c.topic === interaction.user.id);
    if (userTickets.size >= 2) {
        return interaction.reply({ content: '❌ Você já atingiu o limite de **2 tickets abertos**.', flags: 64 });
    }

    const modal = new ModalBuilder()
        .setCustomId('modal_gift_info')
        .setTitle('🎁 Compra de Gift Gamepass');

    const gameInput = new TextInputBuilder()
        .setCustomId('game')
        .setLabel('🎮 Nome do Jogo')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Adopt Me, Brookhaven...')
        .setRequired(true);

    const gamepassInput = new TextInputBuilder()
        .setCustomId('gamepasses')
        .setLabel('🎫 Gamepass(es) (um por linha)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('VIP\n2x Coins\nPet')
        .setRequired(true);

    const paymentInput = new TextInputBuilder()
        .setCustomId('payment_method')
        .setLabel('💳 Método de Pagamento')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Pix ou Criptomoedas')
        .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(gameInput);
    const row2 = new ActionRowBuilder().addComponents(gamepassInput);
    const row3 = new ActionRowBuilder().addComponents(paymentInput);
    modal.addComponents(row1, row2, row3);

    await interaction.showModal(modal);
}

async function createTicket(interaction, data) {
    await interaction.deferReply({ flags: 64 });

    const ticketNumber = getNextTicketNumber();
    const channelName = `ticket-${ticketNumber.toString().padStart(2, '0')}`;
    try {
        const category = interaction.guild.channels.cache.get(config.ticketCategory);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.editReply({ content: '❌ Erro ao criar ticket.', flags: 64 });
        }
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.ticketCategory,
            topic: interaction.user.id,
            permissionOverwrites: [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: config.staffRole, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });
        const claim = new ButtonBuilder().setCustomId('claim_ticket').setLabel('📌 Assumir').setStyle(ButtonStyle.Primary);
        const close = new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(claim, close);
        let embedInfo;
        if (data.type === 'compra') {
            const calculation = calculateRobux(parseInt(data.robux), data.method);
            const totalValue = calculation ? calculation.formattedPrice : 'A calcular';
            const methodName = data.method === 'gamepass' ? '🎮 Gamepass' : '👥 Grupo';
            const methodPrice = data.method === 'gamepass' ? 'R$ 45,90/1k' : 'R$ 29,99/1k';
            embedInfo = new EmbedBuilder()
                .setTitle('🎫 Ticket de Compra')
                .setDescription(`**👤 Cliente:** <@${interaction.user.id}>\n**📦 Método:** ${methodName} (${methodPrice})\n**💰 Quantidade:** ${data.robux} Robux\n**💵 Valor total:** ${totalValue}\n**💳 Pagamento:** ${data.payment}\n\nAguarde o atendimento.`)
                .setColor(data.method === 'gamepass' ? 0x5865F2 : 0x57F287)
                .setFooter({ text: 'Robux Brasil' });
        } else if (data.type === 'gift') {
            embedInfo = new EmbedBuilder()
                .setTitle('🎁 Ticket de Gift')
                .setDescription(`**👤 Cliente:** <@${interaction.user.id}>\n**🎮 Jogo:** ${data.game}\n**🎫 Gamepass(es):**\n${data.gamepasses}\n**💳 Pagamento:** ${data.payment}\n\nAguarde o atendimento.`)
                .setColor(0xFFA500)
                .setFooter({ text: 'Robux Brasil' });
        } else {
            embedInfo = new EmbedBuilder()
                .setTitle('🎫 Ticket de Suporte')
                .setDescription(`**👤 Cliente:** <@${interaction.user.id}>\n**📋 Assunto:** ${data.assunto}\n\nAguarde o atendimento.`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Robux Brasil' });
        }
        await channel.send({ content: `<@${interaction.user.id}> | <@&${config.staffRole}>`, embeds: [embedInfo], components: [row] });
        await interaction.editReply({ content: `✅ Ticket criado: ${channel}`, flags: 64 });
    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        await interaction.editReply({ content: '❌ Erro ao criar ticket.', flags: 64 });
    }
}

client.once('clientReady', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
        await updateInviteCache(guild);
        console.log('✅ Sistema de rastreamento de convites ativo');
    }
    await sendTicketPanel(client);
    console.log('✅ Bot pronto! Use /calculo no Discord');
});

async function sendTicketPanel(client) {
    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;
        const buyChannel = guild.channels.cache.get(config.buyRobuxChannel);
        if (buyChannel) await sendPanelToChannel(buyChannel, '🛒 COMPRAR ROBUX', 'compra');
        const normalChannel = guild.channels.cache.get(config.normalTicketChannel);
        if (normalChannel) await sendPanelToChannel(normalChannel, '🎫 SUPORTE GERAL', 'suporte');
    } catch (error) {
        console.error('Erro ao enviar painéis:', error);
    }
}

async function sendPanelToChannel(channel, title, tipo) {
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMessage = messages.find(m => m.author.id === channel.client.user.id && m.embeds[0]?.title?.includes('ROBUX BRASIL'));
    if (botMessage) return;
    let description = '';
    if (tipo === 'compra') {
        description = `💎 **${title}**\n\nEscolha uma das opções abaixo:\n\n🎮 **Gamepass:** R$ 45,90 a cada 1.000 Robux\n👥 **Grupo:** R$ 29,99 a cada 1.000 Robux\n🎁 **Gift Gamepass**`;
    } else {
        description = `💎 **${title}**\n\nPrecisa de ajuda? Abra um ticket para suporte.\n\n📩 Clique no botão abaixo para iniciar seu atendimento.`;
    }
    const embed = new EmbedBuilder().setTitle('🤖 ROBUX BRASIL').setDescription(description).setColor(0x00FF00).setFooter({ text: 'Robux Brasil' });
    const gamepassButton = new ButtonBuilder().setCustomId('buy_gamepass').setLabel('🎮 Gamepass - R$ 45,90/1k').setStyle(ButtonStyle.Primary);
    const groupButton = new ButtonBuilder().setCustomId('buy_group').setLabel('👥 Grupo - R$ 29,99/1k').setStyle(ButtonStyle.Success);
    const giftButton = new ButtonBuilder().setCustomId('buy_gift').setLabel('🎁 Gift Gamepass').setStyle(ButtonStyle.Secondary);
    const supportButton = new ButtonBuilder().setCustomId('support_ticket').setLabel('🎫 Suporte').setStyle(ButtonStyle.Secondary);
    
    let row;
    if (tipo === 'compra') {
        row = new ActionRowBuilder().addComponents(gamepassButton, groupButton, giftButton);
    } else {
        row = new ActionRowBuilder().addComponents(supportButton);
    }
    await channel.send({ embeds: [embed], components: [row] });
}

client.login(config.token);