const express = require('express');
const multer = require('multer');
const mongoClient = require('./mongodb/connection.js');
const { QueueServiceClient } = require("@azure/storage-queue");
const { ServiceBusClient } = require("@azure/service-bus");
const { ObjectId } = require('mongodb');
const cors = require('cors');
const { uploadFileToBlob, downloadBlob, deleteBlob } = require('./azure/azureStorage.js');
const path = require('path');

const cookieHandler = require('./cookies/cookieHandler.js');

const app = express();
const upload = multer();
const port = process.env.PORT || 3000;

// Use CORS middleware
// app.use(cors());
app.use((req, res, next) => {
  const origin = req.headers.origin;
    cors({
      origin: origin,
      credentials: true
    })(req, res, next);
});

app.use(express.json());

// Set Pug as the view engine
app.set('view engine', 'pug');
// Set the views directory
app.set('views', path.join(__dirname, 'views'));

// Use the cookieHandler routes
app.use(cookieHandler);

// Define Function Queue
const storageQueueConnectionString = process.env.STORAGE_QUEUE_CONNECTION_STRING;
const storageQueueName = process.env.STORAGE_QUEUE_NAME;

const storageQueueServiceClient = QueueServiceClient.fromConnectionString(storageQueueConnectionString);
const storageQueueClient = storageQueueServiceClient.getQueueClient(storageQueueName);

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
    res.status(result?.status).json(result?.data);
  } catch (error) {
    console.error('Database operation error:', error);
    res.status(500).send({ errorMessage: 'Internal Server Error' });
  }
};

// Connect to MongoDB cluster
mongoClient.connectToCluster(() => {
  console.log('MongoDB connection established');

  app.get('/', (req, res) => {
    res.render('welcome_screen');
    // res.send('NodeJS Server working !!');
  });

  app.post('/addData', upload.single('reactFile'), async (req, res) => {
    handleDatabaseOperation(async () => {
      const { price, quantity, item } = req.body;
      if (!price || !quantity || !item) {
        return res.status(400).json({ errorMessage: 'Missing required fields' });
      }

      try {
        let fileUrl = null;
        if (req.file) {
          fileUrl = await uploadFileToBlob(req.file);
        }

        const newData = {
          price,
          quantity,
          item,
          fileUrl,
          filename: req?.file?.originalname,
          date: new Date().toISOString()
        };
        const collection = getDatabaseCollection();
        const result = await collection.insertOne(newData);
        // Send a message to the queue
        try {
          const message = { action: 'addData', data: newData, timestamp: new Date().toISOString() };
          await storageQueueClient.sendMessage(JSON.stringify(message));
          console.log('Message sent to queue');
          await serviceBusSender.sendMessages({ body: message });
          console.log('Message sent to service bus queue');
        } catch (error) {
          console.error('Error sending message to queue:', error);
        }

        // Exclude fileUrl from the response
        const responseData = { ...newData, _id: result.insertedId };
        delete responseData.fileUrl;

        res.status(201).json(responseData);
      } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ errorMessage: 'Error uploading file' });
      }
    }, res);
  });

  app.post('/downloadFileInAzure', async (req, res) => {
    const { id, filename } = req.body;
    if (!id || !filename) {
      return res.status(400).json({ errorMessage: 'Missing required fields' });
    }

    try {
      const collection = getDatabaseCollection();
      const document = await collection.findOne({ _id: new ObjectId(id) });
      if (!document) {
        return res.status(404).json({ errorMessage: 'File not found' });
      }

      const fileUrl = document.fileUrl;
      const downloadFilePath = path.join(__dirname, 'downloaded-file.txt');
      await downloadBlob(fileUrl, downloadFilePath);

      const downloadFilename = filename || 'downloaded-file.txt';
      res.download(downloadFilePath, downloadFilename, async (err) => {
        // Send a message to the queue
        if (!err) {
          try {
            const message = { action: 'File Downloaded', id, timestamp: new Date().toISOString() };
            await storageQueueClient.sendMessage(JSON.stringify(message));
            console.log('Message sent to queue');
            await serviceBusSender.sendMessages({ body: message });
            console.log('Message sent to service bus queue');
          } catch (error) {
            console.error('Error sending message to queue:', error);
          }
        }
        if (err) {
          console.error('Error sending file:', err);
          res.status(500).json({ errorMessage: 'Error downloading file' });
        }
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ errorMessage: 'Error downloading file' });
    }
  });

  app.get('/getAllData', (req, res) => {
    handleDatabaseOperation(async () => {
      const collection = getDatabaseCollection();
      const result = await collection.find().toArray();

      // Remove fileUrl from each document
      const data = result.map(doc => {
        const { fileUrl, ...rest } = doc;
        return rest;
      });

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
      const document = await collection.findOne({ _id: new ObjectId(id) });
      if (!document) {
        return { status: 404, data: { errorMessage: 'No document found with the given ID' } };
      }

      const filename = document.filename;
      if (filename) {
        try {
          await deleteBlob(filename);
        } catch (error) {
          return { status: 500, data: { errorMessage: 'Error deleting file from Azure Blob Storage' } };
        }
      }

      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return { status: 404, data: { errorMessage: 'No document found with the given ID' } };
      }

      // Send a message to the queue
      try {
        const message = { action: 'deleteData', id, timestamp: new Date().toISOString() };
        await storageQueueClient.sendMessage(JSON.stringify(message));
        console.log('Message sent to queue');
        await serviceBusSender.sendMessages({ body: message });
        console.log('Message sent to service bus queue');
      } catch (error) {
        console.error('Error sending message to queue:', error);
      }

      return { status: 200, data: { successMessage: 'Document and file deleted successfully' } };
    }, res);
  });

  app.put('/updateData', upload.single('reactFile'), async (req, res) => {
    handleDatabaseOperation(async () => {
      const { id, price, quantity, item, existingDeletedFileName } = req.body;
      if (!id || !price || !quantity || !item) {
        return res.status(400).json({ errorMessage: 'Missing required fields' });
      }

      try {
        let fileUrl = null;
        let filename = null;

        // Check if existingDeletedFileName is present and reactFile is present
        if (existingDeletedFileName && existingDeletedFileName !== 'null' && existingDeletedFileName !== 'undefined' && req.file) {
          await deleteBlob(existingDeletedFileName);
          fileUrl = await uploadFileToBlob(req.file);
          filename = req.file.originalname;
        }
        // Check if existingDeletedFileName is present and reactFile is null
        else if (existingDeletedFileName && existingDeletedFileName !== 'null' && existingDeletedFileName !== 'undefined') {
          await deleteBlob(existingDeletedFileName);
        }
        // Check if existingDeletedFileName is null and reactFile is present
        else if ((!existingDeletedFileName || existingDeletedFileName == 'null' || existingDeletedFileName == 'undefined') && req.file) {
          fileUrl = await uploadFileToBlob(req.file);
          filename = req.file.originalname;
        }

        const updatedData = {
          $set: {
            price,
            quantity,
            item,
            date: new Date().toISOString()
          }
        };

        // Conditionally add fileUrl and filename to the update object
        if (fileUrl && filename) {
          updatedData.$set.fileUrl = fileUrl;
          updatedData.$set.filename = filename;
        } else if (existingDeletedFileName && existingDeletedFileName !== 'null' && existingDeletedFileName !== 'undefined' && !filename) {
          updatedData.$set.fileUrl = null;
          updatedData.$set.filename = null;
        }

        const collection = getDatabaseCollection();
        const result = await collection.updateOne({ _id: new ObjectId(id) }, updatedData);
        if (result.matchedCount === 0) {
          return res.status(404).json({ errorMessage: 'Document not found' });
        }

        const updatedDocument = await collection.findOne({ _id: new ObjectId(id) });

        // Send a message to the queue
        try {
          const message = { action: 'updateData', data: updatedDocument, timestamp: new Date().toISOString() };
          await storageQueueClient.sendMessage(JSON.stringify(message));
          console.log('Message sent to queue');
          await serviceBusSender.sendMessages({ body: message });
          console.log('Message sent to service bus queue');
        } catch (error) {
          console.error('Error sending message to queue:', error);
        }

        // Exclude fileUrl from the response
        const responseData = { ...updatedDocument };
        delete responseData.fileUrl;

        res.status(200).json(responseData);
      } catch (error) {
        console.error('Error updating data:', error);
        res.status(500).json({ errorMessage: 'Error updating data' });
      }
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

  // Ensure to close the Service Bus client when your application shuts down
  process.on('SIGINT', async () => {
    await serviceBusSender.close();
    await serviceBusReceiver.close();
    await servicebusClient.close();
    process.exit();
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
