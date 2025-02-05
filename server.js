const express = require('express');
const mongoClient = require('./mongodb/connection.js');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Use CORS middleware
app.use(cors());

// Connect to MongoDB cluster
mongoClient.connectToCluster(() => {
  console.log('MongoDB connection established');

  app.get('/', (req, res) => {
    res.send('NodeJS Server working !!');
  });

  // Example route to get data from a collection
  app.get('/getAllData', async (req, res) => {
    try {
      const db = mongoClient.getDatabase('myDatabase'); // Replace with your database name
      const collection = db.collection('sales'); // Replace with your collection name
      const data = await collection.find().toArray();
      res.json(data);
    } catch (error) {
      console.error('Error fetching data', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
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
