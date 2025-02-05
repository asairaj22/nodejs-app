const { MongoClient } = require('mongodb');
// const dotenv = require('dotenv');

// dotenv.config();

const connectionString = 'mongodb+srv://basic:Rithu22091990@mongo-cluster-rest.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000';

// const connectionString = process.env.CONNECTION_STRING;
console.log('Connection String:', connectionString);

const client = new MongoClient(connectionString, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

var _cluster;

module.exports = {
    getDatabase: (databaseName) => {
        let database = _cluster.db(databaseName);
        console.log(`Connected to database ${databaseName}`);
        return database;
    },
    connectToCluster: async function (callback) {
        try {
            let cluster = await client.connect();
            if (cluster) {
                _cluster = cluster;
                console.log('Connected to cluster');
                if (callback) callback();
            }
        } catch (error) {
            console.error('Failed to connect to cluster', error);
        }
    }
};




// import { MongoClient } from 'mongodb';

// const connectionString = process.env.CONNECTION_STRING;

// const client = new MongoClient(connectionString, {
//     useNewUrlParser: true
// });

// var _cluster;

// export default {
//     getDatabase: (databaseName) => {
//         let database = _cluster.db(databaseName);
//         console.log(`Connected to database ${databaseName}`);
//         return database;
//     },
//     connectToCluster: async function (callback) {
//         let cluster = await client.connect();
//         if (cluster) {
//             _cluster = cluster;
//             console.log('Connected to cluster');
//         }
//     }
// }