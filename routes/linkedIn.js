import express from 'express';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });


const router = express.Router();


// Get LinkedIn user info
router.post('/userinfo', async (req, res) => {
  const { accessToken } = req.body;

  try {
    const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching LinkedIn user info:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve user info' });
  }
});

// Post to LinkedIn endpoint with image support
router.post('/post', upload.single('image'), async (req, res) => {
  try {
    // With multer, form fields should be in req.body
    console.log('req.body:', req.body); // Debug line
    console.log('req.file:', req.file); // Debug line
    
    const { accessToken, text, userUrn } = req.body;
    const imageFile = req.file;

    if (!accessToken || !userUrn) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        received: { accessToken: !!accessToken, userUrn: !!userUrn }
      });
    }
    let postData;

    if (imageFile) {
      // Post with image
      try {
        const imageAsset = await uploadImageToLinkedIn(accessToken, imageFile.buffer, userUrn);

        postData = {
          author: userUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: text || '',
              },
              shareMediaCategory: 'IMAGE',
              media: [
                {
                  status: 'READY',
                  description: {
                    text: 'Image description'
                  },
                  media: imageAsset,
                  title: {
                    text: 'Image'
                  }
                }
              ]
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        };
      } catch (imageError) {
        console.error('Failed to upload image, posting text only:', imageError);
        // Fallback to text-only post
        postData = {
          author: userUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        };
      }
    } else {
      // Text-only post
      postData = {
        author: userUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };
    }

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      postData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error posting to LinkedIn:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to post to LinkedIn',
      details: error.response?.data || error.message,
    });
  }
});

export default router;