const express = require('express');
const multer = require('multer');
const router = express.Router();
const Post = require('../models/Posts');
const auth = require('../middleware/auth');

// Configure multer
const storage = multer.memoryStorage(); // or use diskStorage if you want to save files
const upload = multer({ storage: storage });


router.post('/', auth, upload.single('image'), async (req, res) => {
    console.log('POST /api/posts hit');
    console.log('Body:', req.body);
    console.log('File:', req.file);

    const { message, platforms } = req.body;

    // Handle the case when either a message or an image is provided
    if (!message && !req.file) {
      return res.status(400).json({ error: 'Please provide a message or image' });
    }

    try {
      // Parse the platforms if they are provided
      const parsedPlatforms = platforms ? JSON.parse(platforms) : [];

      // Create the post object, including text and image if available
      const newPost = new Post({
        text: message || '',
        platforms: parsedPlatforms,
      });

      // Save the post to the database
      const savedPost = await newPost.save();
      res.status(201).json({ message: 'Post saved successfully', post: savedPost });
    } catch (err) {
      console.error('Error saving post:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });


module.exports = router;