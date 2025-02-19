const { BlobServiceClient, BlobClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const sasToken = process.env.STORAGE_SAS_TOKEN;
const containerName = process.env.STORAGE_CONTAINER_NAME;
const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;

const blobServiceClient = new BlobServiceClient(
  `https://${storageAccountName}.blob.core.windows.net/?${sasToken}`
);

const uploadFileToBlob = async (file) => {
    // Get the current timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Append the timestamp to the original filename
    const fileNameWithTimestamp = `${file.originalname}-${timestamp}`;

    console.log('File Name:', fileNameWithTimestamp);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(fileNameWithTimestamp);

    try {
        await blobClient.uploadData(file.buffer);
        console.log('File uploaded successfully');
        return blobClient.url;
    } catch (error) {
        console.error('Error uploading to Azure Blob Storage:', error);
        throw error;
    }
};


const downloadBlob = async (blobUrl, downloadFilePath) => {
    const blobClient = new BlobClient(blobUrl);
    try {
        const downloadBlockBlobResponse = await blobClient.download(0);
        const downloaded = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
        fs.writeFileSync(downloadFilePath, downloaded);
        return downloadFilePath;
    } catch (error) {
        console.error('Error downloading from Azure Blob Storage:', error);
        throw error;
    }
};

const streamToBuffer = async (readableStream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data instanceof Buffer ? data : Buffer.from(data));
        });
        readableStream.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        readableStream.on('error', reject);
    });
};

const deleteBlob = async (filename) => {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(filename);

    try {
        await blobClient.delete();
        console.log('File deleted successfully');
    } catch (error) {
        console.error('Error deleting file from Azure Blob Storage:', error);
        throw error;
    }
};

module.exports = { uploadFileToBlob, downloadBlob, deleteBlob };
