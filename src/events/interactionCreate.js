const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const config = require('../config');
const { getNextTicketNumber } = require('../utils/store');
const { generateTranscript } = require('../utils/transcript');
const { calculateRobux, generateCalculationEmbed } = require('../utils/calculator');
const affiliates = require('../utils/affiliates');

module.exports = {
    async execute(interaction, client) {

        // ==================== COMANDO /calculo ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'calculo') {
            await showCalculationModal(interaction);
        }

        // ==================== COMANDO /anunciar ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'anunciar') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({
                    content: '❌ Apenas staff pode usar este comando.',
                    flags: 64
                });
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

        // ==================== PROCESSAR MODAL DE ANÚNCIO ====================
        if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_anuncio_')) {
            const anuncioId = interaction.customId.replace('modal_anuncio_', '');
            const tempData = client.tempData?.[anuncioId];

            if (!tempData || tempData.usuario !== interaction.user.id) {
                return interaction.reply({
                    content: '❌ Erro ao processar anúncio.',
                    flags: 64
                });
            }

            const mensagem = interaction.fields.getTextInputValue('mensagem');
            const canal = await client.channels.fetch(tempData.canal);
            const titulo = tempData.titulo;
            const imagemUrl = tempData.imagem;

            const cores = {
                'verde': 0x00FF00,
                'vermelho': 0xFF0000,
                'azul': 0x0000FF,
                'amarelo': 0xFFFF00,
                'laranja': 0xFFA500,
                'roxo': 0x800080,
                'rosa': 0xFF69B4,
                'cinza': 0x808080
            };

            const corHex = cores[tempData.cor.toLowerCase()] || 0x00FF00;

            const embed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(mensagem)
                .setColor(corHex)
                .setFooter({ text: 'Robux Brasil' })
                .setTimestamp();

            if (imagemUrl) {
                embed.setImage(imagemUrl);
            }

            await canal.send({ embeds: [embed] });
            
            await interaction.reply({
                content: `✅ Anúncio enviado em ${canal}!`,
                flags: 64
            });

            delete client.tempData[anuncioId];
        }

        // ==================== COMANDO /afiliado ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'afiliado') {
            // Verificar se já é afiliado
            let affiliate = affiliates.getAffiliate(interaction.user.id);
            
            if (affiliate) {
                return interaction.reply({
                    content: `✅ Você já é um afiliado! Use \`/minhasvendas\` para ver seus ganhos.`,
                    flags: 64
                });
            }
            
            // Registrar novo afiliado
            affiliate = affiliates.registerAffiliate(interaction.user.id, interaction.user.username);
            
            // Criar convite permanente
            const invite = await interaction.channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                reason: `Convite de afiliado para ${interaction.user.tag}`
            });
            
            const embed = new EmbedBuilder()
                .setTitle('🔗 Você agora é um afiliado!')
                .setDescription(`
**Compartilhe este link com seus amigos:**

\`${invite.url}\`

**Como funciona:**
- Quando alguém entrar pelo seu link, será automaticamente registrado como seu indicado
- Se essa pessoa comprar acima de 400 Robux, você ganha **10% da venda!**
- Use \`/minhasvendas\` para acompanhar seus ganhos
                `)
                .setColor(0x00FF00)
                .setFooter({ text: 'Robux Brasil' });
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // ==================== COMANDO /minhasvendas ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'minhasvendas') {
            const affiliate = affiliates.getAffiliate(interaction.user.id);
            
            if (!affiliate) {
                return interaction.reply({
                    content: '❌ Você não é um afiliado. Use `/afiliado` para se tornar um!',
                    flags: 64
                });
            }
            
            // Calcular cliques que compraram
            let comprasRealizadas = 0;
            if (affiliate.clicks) {
                comprasRealizadas = Object.values(affiliate.clicks).filter(c => c.purchased).length;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Suas Vendas como Afiliado')
                .setDescription(`
**Total de vendas:** ${affiliate.totalSales || 0}
**Comissão total:** R$ ${(affiliate.totalCommission || 0).toFixed(2)}
**Pessoas que entraram pelo seu link:** ${affiliate.clicks ? Object.keys(affiliate.clicks).length : 0}
**Compras realizadas:** ${comprasRealizadas}

💡 Lembre-se: você ganha 10% quando alguém que usou seu link comprar acima de 400 Robux.
                `)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // ==================== COMANDO /afiliados (apenas staff) ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'afiliados') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({
                    content: '❌ Apenas staff pode usar este comando.',
                    flags: 64
                });
            }
            
            const allAffiliates = affiliates.listAffiliates();
            
            if (allAffiliates.length === 0) {
                return interaction.reply({
                    content: '📭 Nenhum afiliado cadastrado ainda.',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Lista de Afiliados')
                .setDescription(allAffiliates.map(aff => 
                    `**${aff.username}**\n📊 Vendas: ${aff.totalSales} | 💰 Comissão: R$ ${aff.totalCommission.toFixed(2)} | 👥 Entradas: ${aff.clicksCount}`
                ).join('\n\n'))
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }

        // ==================== COMANDO /pendentes (apenas dono) ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'pendentes') {
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

        // ==================== PROCESSAR MODAL DE CÁLCULO ====================
        if (interaction.isModalSubmit() && interaction.customId === 'modal_calculo') {
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
            
            await interaction.reply({
                embeds: [embed],
                flags: 64
            });
        }

        // ==================== BOTÃO SUPORTE GERAL ====================
        if (interaction.isButton() && interaction.customId === 'support_ticket') {
            await showSupportModal(interaction);
        }

        // ==================== BOTÃO GAMEPASS ====================
        if (interaction.isButton() && interaction.customId === 'buy_gamepass') {
            await showPurchaseModal(interaction, 'gamepass');
        }

        // ==================== BOTÃO GRUPO ====================
        if (interaction.isButton() && interaction.customId === 'buy_group') {
            await showPurchaseModal(interaction, 'grupo');
        }

        // ==================== PROCESSAR MODAL DE COMPRA ====================
        if (interaction.isModalSubmit() && interaction.customId === 'modal_ticket_info') {
            const robux = interaction.fields.getTextInputValue('robux_amount');
            const payment = interaction.fields.getTextInputValue('payment_method');
            const methodDisplay = interaction.fields.getTextInputValue('purchase_method');
            
            let method = '';
            if (methodDisplay.includes('Gamepass')) {
                method = 'gamepass';
            } else if (methodDisplay.includes('Grupo')) {
                method = 'grupo';
            } else {
                return interaction.reply({
                    content: '❌ Método inválido.',
                    flags: 64
                });
            }

            await createTicket(interaction, {
                type: 'compra',
                robux: robux,
                payment: payment,
                method: method
            });
        }

        // ==================== PROCESSAR MODAL DE SUPORTE ====================
        if (interaction.isModalSubmit() && interaction.customId === 'modal_support_info') {
            const assunto = interaction.fields.getTextInputValue('assunto');
            
            await createTicket(interaction, {
                type: 'suporte',
                assunto: assunto
            });
        }

        // ==================== CLAIM TICKET ====================
        if (interaction.isButton() && interaction.customId === 'claim_ticket') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({
                    content: '❌ Apenas staff pode assumir.',
                    flags: 64
                });
            }

            if (interaction.channel.name.includes('assumido')) {
                return interaction.reply({
                    content: '⚠️ Ticket já assumido.',
                    flags: 64
                });
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

        // ==================== FECHAR TICKET (COM CONFIRMAÇÃO DO DONO) ====================
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            if (!interaction.member.roles.cache.has(config.staffRole)) {
                return interaction.reply({
                    content: '❌ Apenas staff pode fechar.',
                    flags: 64
                });
            }

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
                    .setDescription(`
**Ticket:** ${interaction.channel.name}
**Cliente:** <@${interaction.channel.topic}>
**Atendente:** ${claimedBy}
**Fechado por:** ${interaction.user.tag}
                    `)
                    .setColor(0xFF0000)
                    .setTimestamp();

                const logChannel = interaction.guild.channels.cache.get(config.logChannel);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [logEmbed],
                        files: [transcriptPath]
                    });
                }

                // ==================== DETECTAR VENDA E CRIAR CONFIRMAÇÃO ====================
                let robuxAmount = 0;
                let buyerUsername = '';
                let wasPurchase = false;
                
                const ticketMessages = await interaction.channel.messages.fetch({ limit: 50 });
                const embedMessage = ticketMessages.find(m => m.embeds[0]?.title === '🎫 Ticket de Compra');
                if (embedMessage && embedMessage.embeds[0]) {
                    wasPurchase = true;
                    const description = embedMessage.embeds[0].description;
                    const robuxMatch = description.match(/\*\*💰 Quantidade:\*\* (\d+) Robux/);
                    if (robuxMatch) {
                        robuxAmount = parseInt(robuxMatch[1]);
                    }
                    const userMatch = description.match(/<@!?(\d+)>/);
                    if (userMatch) {
                        try {
                            const user = await client.users.fetch(userMatch[1]);
                            buyerUsername = user.username;
                        } catch (e) {}
                    }
                }
                
                // Se foi uma compra, criar venda pendente e enviar confirmação para o dono
                if (wasPurchase && robuxAmount > 0) {
                    const pendingSale = affiliates.registerPendingSale(
                        interaction.channel.topic,
                        buyerUsername,
                        robuxAmount,
                        interaction.channel.id,
                        interaction.user.tag
                    );
                    
                    // Enviar mensagem de confirmação para o dono
                    const ownerChannel = interaction.guild.channels.cache.get(config.ownerConfirmChannel);
                    const owner = await client.users.fetch(config.ownerId);
                    
                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('💰 VENDA PENDENTE - CONFIRMAÇÃO NECESSÁRIA')
                        .setDescription(`
**Cliente:** <@${interaction.channel.topic}>
**Robux:** ${robuxAmount}
**Valor da compra:** R$ ${((robuxAmount / 1000) * 45.90).toFixed(2)}
**Afiliado:** ${pendingSale.affiliateId ? `<@${pendingSale.affiliateId}>` : 'Nenhum'}
**Comissão (10%):** R$ ${pendingSale.commission.toFixed(2)}
**Ticket:** ${interaction.channel.name}
**Staff que fechou:** ${interaction.user.tag}

Use os botões abaixo para confirmar ou rejeitar esta venda.
                        `)
                        .setColor(0xFFA500)
                        .setTimestamp();
                    
                    const confirmRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_sale_${pendingSale.id}`)
                                .setLabel('✅ Confirmar Venda')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`reject_sale_${pendingSale.id}`)
                                .setLabel('❌ Rejeitar Venda')
                                .setStyle(ButtonStyle.Danger)
                        );
                    
                    if (ownerChannel) {
                        await ownerChannel.send({ embeds: [confirmEmbed], components: [confirmRow] });
                    }
                    if (owner) {
                        await owner.send({ embeds: [confirmEmbed], components: [confirmRow] }).catch(() => {});
                    }
                    
                    await interaction.editReply({
                        content: `✅ Ticket finalizado. Venda de ${robuxAmount} Robux registrada para confirmação do dono.`
                    });
                } else {
                    await interaction.editReply({
                        content: '✅ Ticket finalizado.'
                    });
                }

                // Sistema de avaliação
                const clientId = interaction.channel.topic;
                if (clientId) {
                    try {
                        const user = await client.users.fetch(clientId);
                        
                        const reviewButtons = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`review_1_${interaction.channel.id}`)
                                    .setLabel('⭐ 1')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId(`review_2_${interaction.channel.id}`)
                                    .setLabel('⭐⭐ 2')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId(`review_3_${interaction.channel.id}`)
                                    .setLabel('⭐⭐⭐ 3')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId(`review_4_${interaction.channel.id}`)
                                    .setLabel('⭐⭐⭐⭐ 4')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId(`review_5_${interaction.channel.id}`)
                                    .setLabel('⭐⭐⭐⭐⭐ 5')
                                    .setStyle(ButtonStyle.Success)
                            );
                        
                        const reviewEmbed = new EmbedBuilder()
                            .setTitle('⭐ Avalie seu atendimento')
                            .setDescription(`
Olá! Seu atendimento foi finalizado.

**Como você avalia o atendimento que recebeu?**
                            `)
                            .setColor(0x00FF00)
                            .setFooter({ text: 'Robux Brasil' })
                            .setTimestamp();
                        
                        await user.send({
                            embeds: [reviewEmbed],
                            components: [reviewButtons]
                        }).catch(() => console.log(`Não foi possível enviar DM para ${user.tag}`));
                        
                    } catch (err) {
                        console.error('Erro ao enviar avaliação:', err);
                    }
                }

                setTimeout(() => {
                    interaction.channel.delete().catch(console.error);
                }, 3000);

            } catch (error) {
                console.error('Erro ao fechar ticket:', error);
                await interaction.editReply({
                    content: '❌ Erro ao finalizar.'
                });
            }
        }

        // ==================== CONFIRMAR VENDA (BOTÃO) ====================
        if (interaction.isButton() && interaction.customId.startsWith('confirm_sale_')) {
            if (interaction.user.id !== config.ownerId) {
                return interaction.reply({
                    content: '❌ Apenas o dono do bot pode confirmar vendas.',
                    flags: 64
                });
            }
            
            const saleId = interaction.customId.replace('confirm_sale_', '');
            const sale = affiliates.confirmSale(saleId);
            
            if (!sale) {
                return interaction.reply({
                    content: '❌ Venda não encontrada ou já processada.',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Venda Confirmada!')
                .setDescription(`
**Cliente:** <@${sale.buyerId}>
**Robux:** ${sale.robuxAmount}
**Valor:** R$ ${sale.price.toFixed(2)}
**Afiliado:** ${sale.affiliateId ? `<@${sale.affiliateId}>` : 'Nenhum'}
**Comissão:** R$ ${sale.commission.toFixed(2)}
                `)
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
            
            if (sale.affiliateId) {
                try {
                    const affiliateUser = await client.users.fetch(sale.affiliateId);
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('💰 Comissão Confirmada!')
                        .setDescription(`
Você recebeu uma comissão de **R$ ${sale.commission.toFixed(2)}**!
- **Cliente:** ${sale.buyerUsername}
- **Robux comprados:** ${sale.robuxAmount}
- **Comissão:** 10% do valor da compra
                        `)
                        .setColor(0x00FF00)
                        .setTimestamp();
                    await affiliateUser.send({ embeds: [dmEmbed] }).catch(() => {});
                } catch (e) {}
            }
        }

        // ==================== REJEITAR VENDA (BOTÃO) ====================
        if (interaction.isButton() && interaction.customId.startsWith('reject_sale_')) {
            if (interaction.user.id !== config.ownerId) {
                return interaction.reply({
                    content: '❌ Apenas o dono do bot pode rejeitar vendas.',
                    flags: 64
                });
            }
            
            const saleId = interaction.customId.replace('reject_sale_', '');
            const sale = affiliates.rejectSale(saleId);
            
            if (!sale) {
                return interaction.reply({
                    content: '❌ Venda não encontrada ou já processada.',
                    flags: 64
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Venda Rejeitada')
                .setDescription(`
**Cliente:** <@${sale.buyerId}>
**Robux:** ${sale.robuxAmount}
**Motivo:** Venda não confirmada pelo dono.
                `)
                .setColor(0xFF0000)
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }

        // ==================== SISTEMA DE AVALIAÇÃO ====================
        if (interaction.isButton() && interaction.customId.startsWith('review_')) {
            const parts = interaction.customId.split('_');
            const rating = parseInt(parts[1]);
            const channelId = parts[2];
            
            const starNames = {
                1: '⭐ 1 Estrela',
                2: '⭐⭐ 2 Estrelas',
                3: '⭐⭐⭐ 3 Estrelas',
                4: '⭐⭐⭐⭐ 4 Estrelas',
                5: '⭐⭐⭐⭐⭐ 5 Estrelas'
            };
            
            let ticketName = 'Desconhecido';
            try {
                const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
                if (ticketChannel) {
                    ticketName = ticketChannel.name;
                }
            } catch (e) {}
            
            const reviewChannel = client.channels.cache.get(config.reviewChannel);
            if (reviewChannel) {
                const reviewEmbed = new EmbedBuilder()
                    .setTitle('📝 Nova Avaliação')
                    .setDescription(`
**Cliente:** <@${interaction.user.id}>
**Ticket:** ${ticketName}
**Avaliação:** ${starNames[rating]}
                    `)
                    .setColor(rating >= 4 ? 0x00FF00 : rating === 3 ? 0xFFA500 : 0xFF0000)
                    .setTimestamp();
                
                await reviewChannel.send({ embeds: [reviewEmbed] });
            }
            
            await interaction.reply({
                content: `✅ Obrigado pela avaliação! Você deu **${starNames[rating]}**.`,
                flags: 64
            });
            
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('disabled')
                        .setLabel('⭐ Avaliação registrada')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
            
            await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
        }
    }
};

// ==================== MODAL DE CÁLCULO ====================
async function showCalculationModal(interaction) {
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

// ==================== MODAL DE SUPORTE ====================
async function showSupportModal(interaction) {
    const category = interaction.guild.channels.cache.get(config.ticketCategory);
    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({
            content: '❌ Erro de configuração. Contate um administrador.',
            flags: 64
        });
    }

    const userTickets = interaction.guild.channels.cache.filter(
        c => c.parentId === config.ticketCategory && c.topic === interaction.user.id
    );

    if (userTickets.size >= 2) {
        return interaction.reply({
            content: '❌ Você já atingiu o limite de **2 tickets abertos**.',
            flags: 64
        });
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

// ==================== MODAL DE COMPRA ====================
async function showPurchaseModal(interaction, method) {
    const category = interaction.guild.channels.cache.get(config.ticketCategory);
    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({
            content: '❌ Erro de configuração. Contate um administrador.',
            flags: 64
        });
    }

    const userTickets = interaction.guild.channels.cache.filter(
        c => c.parentId === config.ticketCategory && c.topic === interaction.user.id
    );

    if (userTickets.size >= 2) {
        return interaction.reply({
            content: '❌ Você já atingiu o limite de **2 tickets abertos**.',
            flags: 64
        });
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

// ==================== CRIAR TICKET ====================
async function createTicket(interaction, data) {
    const ticketNumber = getNextTicketNumber();
    const channelName = `ticket-${ticketNumber.toString().padStart(2, '0')}`;

    try {
        const category = interaction.guild.channels.cache.get(config.ticketCategory);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.reply({
                content: '❌ Erro ao criar ticket.',
                flags: 64
            });
        }

        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.ticketCategory,
            topic: interaction.user.id,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                },
                {
                    id: config.staffRole,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                }
            ]
        });

        const claim = new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('📌 Assumir')
            .setStyle(ButtonStyle.Primary);

        const close = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒 Fechar')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(claim, close);

        let embedInfo;
        
        if (data.type === 'compra') {
            const calculation = calculateRobux(parseInt(data.robux), data.method);
            const totalValue = calculation ? calculation.formattedPrice : 'A calcular';
            const methodName = data.method === 'gamepass' ? '🎮 Gamepass' : '👥 Grupo';
            const methodPrice = data.method === 'gamepass' ? 'R$ 45,90/1k' : 'R$ 29,99/1k';

            embedInfo = new EmbedBuilder()
                .setTitle('🎫 Ticket de Compra')
                .setDescription(`
**👤 Cliente:** <@${interaction.user.id}>
**📦 Método:** ${methodName} (${methodPrice})
**💰 Quantidade:** ${data.robux} Robux
**💵 Valor total:** ${totalValue}
**💳 Pagamento:** ${data.payment}

Aguarde o atendimento.
                `)
                .setColor(data.method === 'gamepass' ? 0x5865F2 : 0x57F287)
                .setFooter({ text: 'Robux Brasil' });
        } else {
            embedInfo = new EmbedBuilder()
                .setTitle('🎫 Ticket de Suporte')
                .setDescription(`
**👤 Cliente:** <@${interaction.user.id}>
**📋 Assunto:** ${data.assunto}

Aguarde o atendimento.
                `)
                .setColor(0x00FF00)
                .setFooter({ text: 'Robux Brasil' });
        }

        await channel.send({
            content: `<@${interaction.user.id}> | <@&${config.staffRole}>`,
            embeds: [embedInfo],
            components: [row]
        });

        await interaction.reply({
            content: `✅ Ticket criado: ${channel}`,
            flags: 64
        });

    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        await interaction.reply({
            content: '❌ Erro ao criar ticket.',
            flags: 64
        });
    }
}