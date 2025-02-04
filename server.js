const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Basic GET endpoint
app.get('/', (req, res) => {
  res.send('NodeJS Server working !!');
});

// Array of objects
const data = [
  { id: 1, name: 'Alice', age: 25 },
  { id: 2, name: 'Bob', age: 30 },
  { id: 3, name: 'Charlie', age: 35 }
];

// GET endpoint to return the array of objects
app.get('/getAll', (req, res) => {
  res.json(data);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
