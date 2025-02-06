const express = require('express');
const mongoClient = require('./mongodb/connection.js');
const cors = require('cors');
const { ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// Use CORS middleware
app.use(cors());
app.use(express.json());

const getDatabaseCollection = () => {
  const db = mongoClient.getDatabase('myDatabase'); // Replace with your database name
  return db.collection('sales'); // Replace with your collection name
};

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
      return { status: 201, data: result.ops ? result.ops[0] : newData };
    }, res);
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
      return { status: 200, data: updatedDocument };
    }, res);
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
