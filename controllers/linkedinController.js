import axios from "axios";
import fs from "fs";
import {
  getLinkedInAuthUrl,
  getAccessToken,
  postToLinkedIn,
  generateState,
} from "../utils/linkedinAuth.js";
import multer from 'multer';

// Configure multer for LinkedIn posts
const upload = multer({ storage: multer.memoryStorage() });

// GET route to start OAuth flow
export const startLinkedInAuth = (req, res) => {
  const state = generateState();
  req.session.state = state;
  const authUrl = getLinkedInAuthUrl();
  res.redirect(authUrl);
};

// GET callback from LinkedIn (if using redirect-based login)
export const linkedInCallback = async (req, res) => {
  const { code, state } = req.query;

  if (state !== req.session.state) {
    return res.status(400).send("State mismatch. Potential CSRF attack.");
  }

  try {
    const accessToken = await getAccessToken(code);
    await postToLinkedIn(accessToken, { content: "Hello LinkedIn!" });
    res.send("Posted to LinkedIn!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to authenticate or post to LinkedIn.");
  }
};

// POST endpoint for frontend to exchange code for access token
export const handleCodeExchange = async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Missing authorization code." });
  }

  try {
    const accessToken = await getAccessToken(code);
    res.json({ accessToken });
  } catch (err) {
    console.error("Token exchange failed:", err.response?.data || err.message);
    res.status(500).json({ error: "Token exchange failed." });
  }
};


// Controller function to fetch LinkedIn user info using access token
export const getLinkedInUserInfo = async (req, res) => {
  const { accessToken } = req.body;

  try {
    const response = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const { sub } = response.data;
    res.json({ sub });
  } catch (err) {
    console.error(
      "Failed to fetch userinfo:",
      err.response?.data || err.message
    );
    res.status(500).json({ 
      error: "Failed to get user info",
      details: err.response?.data || err.message 
    });
  }
};


// Controller function to create a post on LinkedIn
export const createLinkedInPost = [
  upload.single('image'), // Add multer middleware
  async (req, res) => {
    try {
      console.log('=== LINKEDIN POST DEBUG ===');
      console.log('req.body:', req.body);
      console.log('req.file:', req.file);
      console.log('========================');

      const { accessToken, text, userUrn } = req.body;
      const imageFile = req.file;

      if (!accessToken || !userUrn) {
        return res.status(400).json({ 
          error: 'Missing required parameters',
          received: { 
            accessToken: !!accessToken, 
            userUrn: !!userUrn,
            hasFile: !!imageFile 
          }
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
  }
];

// Add the uploadImageToLinkedIn function
const uploadImageToLinkedIn = async (accessToken, imageBuffer, userUrn) => {
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