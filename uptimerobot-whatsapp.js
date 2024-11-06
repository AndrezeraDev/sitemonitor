const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const prompt = require('prompt-sync')();
const fs = require('fs');
const path = require('path');

// UptimeRobot API config
const apiKey = 'u2694588-20b1eaa47767d1d7738726ba';
const apiUrl = 'https://api.uptimerobot.com/v2/getMonitors';

// Configuração do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
});

// Gerar QR Code para autenticação no WhatsApp Web
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Escaneie o QR code acima no seu WhatsApp.');
});

// Mensagem de sucesso ao conectar no WhatsApp Web
client.on('ready', async () => {
    console.log('Cliente conectado ao WhatsApp Web');
    await selectCustomerGroups(); // Selecionar grupos de clientes após autenticação
    await selectGroups(); // Selecionar grupos para notificação dos admins
    checkMonitors();
    // Verifica o status dos sites a cada 5 minutos
    setInterval(checkMonitors, 5 * 60 * 1000);
});

// Se o cliente desconectar, tenta se reconectar e exclui a pasta .wwebjs_auth
client.on('disconnected', (reason) => {
    console.log('Cliente desconectado, tentando reconectar...', reason);
    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('Pasta ".wwebjs_auth" excluída com sucesso.');
    }
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// Variável para armazenar os monitores
let monitorsList = [];

// Variável para armazenar os grupos de clientes e seus sites associados
let customerGroups = [];

// Variável para armazenar os grupos de administração selecionados
let selectedGroupIds = [];

// Função para verificar o status dos sites
async function checkMonitors() {
    try {
        const response = await axios.post(apiUrl, {
            api_key: apiKey,
            format: 'json'
        });

        monitorsList = response.data.monitors;

        for (const monitor of monitorsList) {
            const { friendly_name, status, url } = monitor;

            // Verifica se houve alteração de status
            for (const customerGroup of customerGroups) {
                if (customerGroup.sites.includes(url)) {
                    if (status === 9) {
                        await notifyGroup(customerGroup.groupId, friendly_name, url, "offline");
                    } else if (status === 2) {
                        await notifyGroup(customerGroup.groupId, friendly_name, url, "online");
                    } else if (status === 0) {
                        await notifyGroup(customerGroup.groupId, friendly_name, url, "paused");
                    }
                }
            }
        }
    } catch (error) {
        console.error('Erro ao verificar os monitores:', error);
    }
}

// Função para notificar um grupo específico
async function notifyGroup(groupId, siteName, siteUrl, status) {
    let message;
    if (status === "offline") {
        message = `⚠️ O site ${siteName} (${siteUrl}) está OFFLINE!`;
    } else if (status === "online") {
        message = `✅ O site ${siteName} (${siteUrl}) voltou a ficar ONLINE!`;
    } else if (status === "paused") {
        message = `⏸️ O monitor do site ${siteName} (${siteUrl}) está PAUSADO!`;
    }

    try {
        await client.sendMessage(groupId, message);
        console.log(`Mensagem enviada para o grupo ${groupId}: ${message}`);
    } catch (error) {
        console.error('Erro ao notificar o grupo:', error);
    }
}

// Função para selecionar grupos de administração
async function selectGroups() {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    if (groups.length === 0) {
        console.log('Nenhum grupo encontrado.');
        return;
    }

    let addingGroups = true;

    while (addingGroups) {
        console.log('Selecione o grupo que deseja notificar:');
        groups.forEach((group, index) => {
            console.log(`${index + 1} - grupo id: ${group.id._serialized} - ${group.name}`);
        });

        const choice = prompt('Digite o número do grupo que deseja notificar: ');
        const selectedGroup = groups[choice - 1];

        if (selectedGroup) {
            selectedGroupIds.push(selectedGroup.id._serialized);
            console.log(`Grupo selecionado: ${selectedGroup.name}`);
        } else {
            console.log('Grupo inválido!');
        }

        const addMore = prompt('Deseja adicionar mais grupos? (s/n): ');
        if (addMore.toLowerCase() !== 's') {
            addingGroups = false;
        }
    }

    console.log(`Grupos selecionados para notificação: ${selectedGroupIds.join(', ')}`);
}

// Função para selecionar grupos de clientes
async function selectCustomerGroups() {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    if (groups.length === 0) {
        console.log('Nenhum grupo de clientes encontrado.');
        return;
    }

    let addingCustomerGroups = true;

    while (addingCustomerGroups) {
        console.log('Selecione o grupo de clientes que deseja notificar:');
        groups.forEach((group, index) => {
            console.log(`${index + 1} - grupo id: ${group.id._serialized} - ${group.name}`);
        });

        const choice = prompt('Digite o número do grupo de clientes que deseja notificar: ');
        const selectedGroup = groups[choice - 1];

        if (selectedGroup) {
            const groupSites = await selectSitesForGroup(); // Seleciona os sites para o grupo
            customerGroups.push({ groupId: selectedGroup.id._serialized, sites: groupSites });
            console.log(`Grupo de clientes selecionado: ${selectedGroup.name}`);
        } else {
            console.log('Grupo inválido!');
        }

        const addMore = prompt('Deseja adicionar mais grupos de clientes? (s/n): ');
        if (addMore.toLowerCase() !== 's') {
            addingCustomerGroups = false;
        }
    }

    console.log(`Grupos de clientes selecionados para notificação:`);
    customerGroups.forEach(group => {
        console.log(`Grupo: ${group.groupId} - Sites: ${group.sites.join(', ')}`);
    });
}

// Função para selecionar sites para um grupo de clientes
async function selectSitesForGroup() {
    const availableSites = [
        'https://hub.vendaseguro.com.br',
        'https://melhorproduto.vendaseguro.com.br'
        // Adicione outros sites aqui
    ];

    let selectedSites = [];

    console.log('Selecione os sites que deseja atribuir a este grupo:');
    availableSites.forEach((site, index) => {
        console.log(`${index + 1} - ${site}`);
    });

    let addingSites = true;

    while (addingSites) {
        const choice = prompt('Digite o número do site que deseja adicionar (ou "0" para finalizar): ');
        const siteIndex = parseInt(choice) - 1;

        if (siteIndex === -1) {
            addingSites = false; // Finaliza a adição de sites
        } else if (siteIndex >= 0 && siteIndex < availableSites.length) {
            const site = availableSites[siteIndex];
            if (!selectedSites.includes(site)) {
                selectedSites.push(site);
                console.log(`Site adicionado: ${site}`);
            } else {
                console.log('Site já adicionado!');
            }
        } else {
            console.log('Seleção inválida!');
        }
    }

    return selectedSites;
}

// Inicialização do cliente WhatsApp
client.initialize();