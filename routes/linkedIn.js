import express from 'express';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

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

// Helper function to upload image to LinkedIn
const uploadImageToLinkedIn = async (accessToken, imagePath, userUrn) => {
  try {
    // Step 1: Register the image upload
    const registerResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: userUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerResponse.data.value.asset;

    // Step 2: Upload the actual image
    const imageBuffer = fs.readFileSync(imagePath);
    
    await axios.post(uploadUrl, imageBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    return asset;
  } catch (error) {
    console.error('Error uploading image to LinkedIn:', error.response?.data || error.message);
    throw error;
  }
};

// Post to LinkedIn endpoint with image support
router.post('/post', async (req, res) => {
  try {
    const { accessToken, text, userUrn, imagePath } = req.body;

    if (!accessToken || !userUrn) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    let postData;

    if (imagePath) {
      // Post with image
      try {
        const imageAsset = await uploadImageToLinkedIn(accessToken, imagePath, userUrn);

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