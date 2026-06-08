import imageCompression from 'browser-image-compression'

export const uploadImageToCloudinary = async (file) => {
  try {
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.8
    }

    const compressedFile = await imageCompression(file, options)

    console.log(`Original: ${(file.size / 1024 / 1024).toFixed(2)}MB → Compressed: ${(compressedFile.size / 1024).toFixed(0)}KB`)

    const formData = new FormData()
    formData.append('file', compressedFile)
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    )

    const data = await response.json()

    if (data.secure_url) {
      return data.secure_url
    } else {
      throw new Error('Upload failed: ' + JSON.stringify(data))
    }
  } catch (error) {
    console.error('Image upload error:', error)
    throw error
  }
}
