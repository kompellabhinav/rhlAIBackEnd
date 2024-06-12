const { CosmosClient } = require("@azure/cosmos");
const { app } = require('@azure/functions');
const crypto = require('crypto');
const { DateTime } = require('luxon');

app.http('saveThreadId', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const cosmosEndpointUri = process.env.CosmosEndpointUri;
        const cosmosPrimaryKey = process.env.CosmosPrimaryKey;
        const databaseId = process.env.CosmosDatabaseId;
        const containerId = process.env.CosmosContainerId;

        context.log('HTTP trigger function processed a request.');

        const body = await request.text();
        let data;
        try {
            data = JSON.parse(body);
        } catch (error) {
            context.log('Invalid JSON format');
            return { status: 400, body: 'Invalid JSON format' };
        }

        let phoneNumber = data.phoneNumber;
        const threadID = data.threadID;

        if (!phoneNumber || !threadID) {
            context.log('Invalid input: phoneNumber or threadID is missing.');
            return { status: 400, body: 'Please pass a valid phoneNumber and threadID in the request body.' };
        }

        // Normalize phone number format
        const normalizedPhoneNumber = phoneNumber.replace(/\D/g, '');
        if (phoneNumber.startsWith('+')) {
            phoneNumber = '+' + normalizedPhoneNumber;
        } else {
            phoneNumber = normalizedPhoneNumber;
        }
        console.log(phoneNumber)

        try {
            const cosmosClient = new CosmosClient({ endpoint: cosmosEndpointUri, key: cosmosPrimaryKey });
            const container = cosmosClient.database(databaseId).container(containerId);

            // Check if the phone number already exists
            const querySpec = {
                query: "SELECT * FROM c WHERE c.phoneNumber = @phoneNumber",
                parameters: [
                    {
                        name: "@phoneNumber",
                        value: phoneNumber
                    }
                ]
            };

            const { resources: items } = await container.items.query(querySpec).fetchAll();

            let threadList;
            let item;

            if (items.length > 0) {
                item = items[0];
                threadList = item.threads || [];

                if (threadList.some(thread => thread.threadID === threadID)) {
                    context.log('Duplicate threadID found. Not adding.');
                    return { status: 200, body: 'Thread ID already exists. Not added again.' };
                }

                const estTimestamp = DateTime.now().setZone('America/New_York').toISO();
                threadList.push({ threadID: threadID, timestamp: estTimestamp });
                item.threads = threadList;
            } else {
                // Create a new entry for the phone number
                const estTimestamp = DateTime.now().setZone('America/New_York').toISO();
                threadList = [{ threadID: threadID, timestamp: estTimestamp }];
                item = {
                    id: crypto.randomBytes(16).toString("hex"),
                    phoneNumber: phoneNumber,
                    threads: threadList
                };
            }

            await container.items.upsert(item);

            context.log('Thread ID added successfully.');
            return { status: 200, body: 'Thread ID added successfully.' };
        } catch (error) {
            context.log(`Error interacting with Cosmos DB: ${error.message}`);
            return { status: 500, body: 'Internal server error' };
        }
    }
});
