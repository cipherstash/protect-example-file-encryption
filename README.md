# File Encryption with Protect.js

This example demonstrates how to use [Protect.js](https://github.com/cipherstash/protectjs) to securely encrypt files before storing them in object storage. The example uses Supabase Storage as the object storage provider, but the same pattern can be applied to any storage service.

## Overview

This application demonstrates a secure file handling workflow:

1. **Upload Process**:
   - Client uploads a file to the backend
   - Backend converts the file to base64
   - File is encrypted using Protect.js
   - Encrypted EQL JSON payload is stored in object storage

2. **Download Process**:
   - Client requests file download
   - Backend retrieves encrypted EQL JSON from storage
   - File is decrypted using Protect.js
   - Decrypted file is converted back to its original format
   - File is returned to the client

## Prerequisites

- Node.js 18 or later
- A CipherStash account and workspace
- A Supabase account (or any other object storage provider)

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

CS_CLIENT_ID=your_client_id
CS_CLIENT_KEY=your_client_key
CS_CLIENT_ACCESS_KEY=your_client_access_key
CS_WORKSPACE_CRN=your_workspace_crn
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd file-encryption
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the server:
```bash
pnpm run start
```

The server will start on port 3000.

## API Endpoints

### Upload File
```bash
curl -X POST http://localhost:3000/upload \
-F "file=@path/to/your/file.pdf"
```

Response:
```json
{
  "message": "File uploaded successfully",
  "file": {
    "name": "example.pdf",
    "type": "application/pdf",
    "size": 123456
  }
}
```

## How It Works

### File Encryption Flow

1. **File Upload**:
   - Client sends file to `/upload` endpoint
   - File is received as multipart form data

2. **Encryption Process**:
   ```typescript
   // Convert file to base64
   const arrayBuffer = await file.arrayBuffer()
   const base64String = Buffer.from(arrayBuffer).toString('base64')

   // Encrypt using Protect.js
   const encrypted = await protectClient.encrypt(base64String, {
     table: uploads,
     column: uploads.file,
   })

   if ('failure' in encrypted) {
     // Handle error
     return c.json({ error: 'Failed to encrypt file' }, 500)
   }

   // Create a Blob from the string
   const blob = new Blob([JSON.stringify(encrypted.data)], {
     type: 'application/json',
   })

   // Create a File object from the Blob with the original filename
   const fileToUpload = new File([blob], `${file.name}.encrypted`, {
     type: 'application/json',
   })

   // Upload the file to Supabase Storage
   const { data, error } = await supabase.storage
     .from('uploads')
     .upload(`${file.name}.encrypted`, fileToUpload)
   ```

3. **Storage**:
   - Encrypted EQL JSON payload is stored in object storage with `.encrypted` extension
   - Original file is never stored in its unencrypted form

### File Decryption Flow

1. **File Retrieval**:
   - Backend retrieves encrypted EQL JSON from storage
   - JSON is parsed and decrypted using Protect.js

2. **Decryption Process**:
   ```typescript
   // Download the encrypted file
   const { data: downloadedFile, error: downloadError } = 
     await supabase.storage.from('uploads').download(`${file.name}.encrypted`)

   if (!downloadedFile) {
     return c.json({ error: 'Failed to download file' }, 500)
   }

   // Parse the downloaded JSON
   const downloadedText = await downloadedFile.text()
   const downloadedJson = JSON.parse(downloadedText)

   // Decrypt the EQL JSON
   const decrypted = await protectClient.decrypt(downloadedJson)

   if ('failure' in decrypted) {
     return c.json({ error: 'Failed to decrypt file' }, 500)
   }

   // Convert back to file
   const buffer = Buffer.from(decrypted.data, 'base64')
   const reconstructedArrayBuffer = buffer.buffer.slice(
     buffer.byteOffset,
     buffer.byteOffset + buffer.byteLength,
   )
   ```

## Security Considerations

- Files are encrypted before storage using Protect.js
- Original files are never stored in their unencrypted form
- You are leveraging CipherStash's ZeroKMS to encrypt and decrypt the files
- Files are stored as an EQL JSON payload in object storage which can be passed directly to the CipherStash Protect.js client to decrypt

## Using Different Storage Providers

This example uses Supabase Storage, but you can adapt it to work with any object storage provider:

1. Replace the Supabase client with your preferred storage client
2. Update the storage operations to match your provider's API
3. Keep the Protect.js encryption/decryption logic unchanged

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support with Protect.js, visit the [Protect.js docs](https://github.com/cipherstash/protectjs).
