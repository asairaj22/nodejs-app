const express = require('express');
const mongoClient = require('./mongodb/connection.js');
const { QueueServiceClient } = require("@azure/storage-queue");
const { ServiceBusClient } = require("@azure/service-bus");
const { ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Define Function Queue
const connectionString = "DefaultEndpointsProtocol=https;AccountName=reactcrudproject;AccountKey=PFsewhzmMPN3KAopcGimBeDLHtKDXxO13g+PpRjHp9UBUUujSm8HSkb6Tscog4/Q363yCrA92/Nh+AStVgay4w==;EndpointSuffix=core.windows.net";
const queueName = "message-queue";

const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
const queueClient = queueServiceClient.getQueueClient(queueName);

// Define DB Connection
const getDatabaseCollection = () => {
  const db = mongoClient.getDatabase('myDatabase'); // Replace with your database name
  return db.collection('sales'); // Replace with your collection name
};

// Define connection string for Service Bus
const serviceBusListenConnectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
const serviceBusQueueName = process.env.SERVICE_BUS_QUEUE_NAME;

// Service Bus - Client & Receiver Queue
const servicebusClient = new ServiceBusClient(serviceBusListenConnectionString);
const serviceBusSender = servicebusClient.createSender(serviceBusQueueName);
const serviceBusReceiver = servicebusClient.createReceiver(serviceBusQueueName);

const handleDatabaseOperation = async (operation, res) => {
  try {
    const result = await operation();
    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Database operation error:', error);
    res.status(500).send({ errorMessage: 'Internal Server Error' });
  }
};

// Connect to MongoDB cluster
mongoClient.connectToCluster(() => {
  console.log('MongoDB connection established');

  app.get('/', (req, res) => res.send('NodeJS Server working !!'));

  app.post('/addData', (req, res) => {
    handleDatabaseOperation(async () => {
      const { price, quantity, item } = req.body;
      if (!price || !quantity || !item) {
        return { status: 400, data: { errorMessage: 'Missing required fields' } };
      }
      const collection = getDatabaseCollection();
      const newData = { price, quantity, item, date: new Date().toISOString() };
      const result = await collection.insertOne(newData);
  
      // Send a message to the queue
      try {
        const message = {
          body: JSON.stringify({ action: 'addData', data: newData, timestamp: new Date().toISOString() }),
          contentType: "application/json"
        };
        // await queueClient.sendMessage(Buffer.from(message).toString('base64'));
        console.log('Message sent to queue');
        await serviceBusSender.sendMessages(message);
        console.log('Message sent to service bus queue');
      } catch (error) {
        console.error('Error sending message to queue:', error);
      }
  
      return { status: 201, data: result.ops ? result.ops[0] : newData };
    }, res);
  });
  
  // Ensure to close the Service Bus client when your application shuts down
  process.on('SIGINT', async () => {
    await serviceBusSender.close();
    // await servicebusSenderClient.close();
    await serviceBusReceiver.close();
    await servicebusClient.close();
    process.exit();
  });

  app.get('/getAllData', (req, res) => {
    handleDatabaseOperation(async () => {
      const collection = getDatabaseCollection();
      const data = await collection.find().toArray();
      return { status: 200, data };
    }, res);
  });
  

  app.delete('/deleteData/:id', (req, res) => {
    handleDatabaseOperation(async () => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return { status: 400, data: { errorMessage: 'Invalid ID format' } };
      }
      const collection = getDatabaseCollection();
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return { status: 404, data: { errorMessage: 'No document found with the given ID' } };
      }
      // Send a message to the queue
      try {
        const message = JSON.stringify({ action: 'deleteData', id, timestamp: new Date().toISOString() });
        await queueClient.sendMessage(Buffer.from(message).toString('base64'));
        console.log('Message sent to queue');
      } catch (error) {
        console.error('Error sending message to queue:', error);
      }
      return { status: 200, data: { successMessage: 'Document deleted successfully' } };
    }, res);
  });

  app.put('/updateData', (req, res) => {
    handleDatabaseOperation(async () => {
      const { id, price, quantity, item } = req.body;
      if (!id || !price || !quantity || !item) {
        return { status: 400, data: { errorMessage: 'Missing required fields' } };
      }
      const collection = getDatabaseCollection();
      const updatedData = { $set: { price, quantity, item, date: new Date().toISOString() } };
      const result = await collection.updateOne({ _id: new ObjectId(id) }, updatedData);
      if (result.matchedCount === 0) {
        return { status: 404, data: { errorMessage: 'Document not found' } };
      }
      const updatedDocument = await collection.findOne({ _id: new ObjectId(id) });
      // Send a message to the queue
      try {
        const message = JSON.stringify({ action: 'updateData', data: updatedDocument,  timestamp: new Date().toISOString() });
        await queueClient.sendMessage(Buffer.from(message).toString('base64'));
        console.log('Message sent to queue');
      } catch (error) {
        console.error('Error sending message to queue:', error);
      }
      return { status: 200, data: updatedDocument };
    }, res);
  });

  app.get('/listen', async (req, res) => {
    try {
      const messages = await serviceBusReceiver.receiveMessages(10, { maxWaitTimeInMs: 50 });
  
      const receivedMessages = messages.map(message => {
        // Complete the message to remove it from the queue
        serviceBusReceiver.completeMessage(message);
        return message.body;
      });
  
      res.status(200).json({ messages: receivedMessages });
    } catch (error) {
      console.error("Error receiving messages:", error);
      res.status(500).json({ error: "Error receiving messages" });
    }
  });

  // Start the server
  app.listen(port, () => console.log(`Server is running on port ${port}`));
});


// const express = require('express');
// const cors = require('cors');
// const app = express();
// const port = process.env.PORT || 3000;

// // Enable CORS for all routes
// app.use(cors());

// // Basic GET endpoint
// app.get('/', (req, res) => {
//   res.send('NodeJS Server working !!');
// });

// // Array of objects
// const data = [
//   { id: 1, name: 'Alice', age: 25 },
//   { id: 2, name: 'Bob', age: 30 },
//   { id: 3, name: 'Charlie', age: 35 },
//   { id: 4, name: 'Alex', age: 22 }
// ];

// // GET endpoint to return the array of objects
// app.get('/getAll', (req, res) => {
//   res.json(data);
// });

// // Start the server
// app.listen(port, () => {
//   console.log(`Server is running on http://localhost:${port}`);
// });
