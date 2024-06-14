const { CosmosClient } = require("@azure/cosmos");
const { app } = require('@azure/functions');
const crypto = require('crypto');

app.http('postVideoDuration', {
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
        const playbackDuration = data.playbackDuration;

        if (!phoneNumber || !threadID || !playbackDuration) {
            context.log('Invalid input: phoneNumber, threadID or playbackDuration is missing.');
            return { status: 400, body: 'Please pass a valid phoneNumber, threadID, and playbackDuration in the request body.' };
        }

        // Normalize phone number format
        const normalizedPhoneNumber = phoneNumber.replace(/\D/g, '');
        if (phoneNumber.startsWith('+')) {
            phoneNumber = '+' + normalizedPhoneNumber;
        } else {
            phoneNumber = normalizedPhoneNumber;
        }

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

            if (items.length === 0) {
                context.log('Phone number not found.');
                return { status: 404, body: 'Phone number not found.' };
            }

            const item = items[0];
            const threadList = item.threads || [];

            const thread = threadList.find(thread => thread.threadID === threadID);
            if (!thread) {
                context.log('Thread ID not found.');
                return { status: 404, body: 'Thread ID not found.' };
            }

            thread.playbackDuration = playbackDuration;

            await container.items.upsert(item);

            context.log('Playback duration added successfully.');
            return { status: 200, body: 'Playback duration added successfully.' };
        } catch (error) {
            context.log(`Error interacting with Cosmos DB: ${error.message}`);
            return { status: 500, body: 'Internal server error' };
        }
    }
});
