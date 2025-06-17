import 'dotenv/config'
import { protect, csTable, csColumn } from '@cipherstash/protect'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set')
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
)

const app = new Hono()

// Although the data isn't being stored in a SQL database,
// these tables and columns values are used to protect against confused deputy attacks.
const uploads = csTable('uploads', {
  file: csColumn('file'),
})

// Where the file is coming from - passing the resume to Azure AI processor
app.post('/upload', async (c) => {
  try {
    const protectClient = await protect({
      schemas: [uploads],
    })

    const formData = await c.req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided or invalid file format' }, 400)
    }

    // Convert file to string (base64)
    const arrayBuffer = await file.arrayBuffer()
    const base64String = Buffer.from(arrayBuffer).toString('base64')

    const encrypted = await protectClient.encrypt(base64String, {
      table: uploads,
      column: uploads.file,
    })

    if ('failure' in encrypted) {
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

    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(`${file.name}.encrypted`, fileToUpload)

    const { data: downloadedFile, error: downloadError } =
      await supabase.storage.from('uploads').download(`${file.name}.encrypted`)

    if (!downloadedFile) {
      return c.json({ error: 'Failed to download file' }, 500)
    }

    const downloadedText = await downloadedFile.text()
    const downloadedJson = JSON.parse(downloadedText)

    const decrypted = await protectClient.decrypt(downloadedJson)

    if ('failure' in decrypted) {
      return c.json({ error: 'Failed to decrypt file' }, 500)
    }

    // Convert string back to ArrayBuffer
    const buffer = Buffer.from(decrypted.data, 'base64')
    const reconstructedArrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    )

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'uploads')
    await writeFile(join(uploadsDir, file.name), buffer)

    // Log file details for debugging
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size,
      originalSize: arrayBuffer.byteLength,
      reconstructedSize: reconstructedArrayBuffer.byteLength,
    })

    const fileDetails = {
      name: file.name,
      type: file.type,
      size: file.size,
    }

    return c.json({
      message: 'File uploaded successfully',
      file: fileDetails,
    })
  } catch (error) {
    // Log the full error for debugging
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return c.json(
      {
        error: 'Failed to upload file',
        details: error.message,
      },
      500,
    )
  }
})

// Start the server
const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
