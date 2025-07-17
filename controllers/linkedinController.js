import axios from "axios";
import fs from "fs";
import {
  getLinkedInAuthUrl,
  getAccessToken,
  postToLinkedIn,
  generateState,
} from "../utils/linkedinAuth.js";

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
export const createLinkedInPost = async (req, res) => {
  try {
    const { accessToken, text, userUrn, imageUrl } = req.body;

    if (!accessToken || !userUrn) {
      return res.status(400).json({ 
        error: "Missing required parameters",
        code: "MISSING_REQUIRED_FIELDS" 
      });
    }

    let imagePath = null;
    if (imageUrl) {
      try {
        const imageResponse = await axios.get(imageUrl, {
          responseType: "stream",
        });

        const tempPath = `uploads/temp-${Date.now()}.jpg`;
        const writer = fs.createWriteStream(tempPath);
        imageResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        imagePath = tempPath;
      } catch (downloadError) {
        console.error("Failed to download image:", downloadError);
      }
    }

    const linkedinResponse = await axios.post(
      "http://localhost:8000/api/linkedin/post",
      {
        accessToken,
        text,
        userUrn,
        imagePath,
      }
    );

    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    res.json(linkedinResponse.data);
  } catch (error) {
    console.error(
      "Error posting to LinkedIn:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to post to LinkedIn",
      details: error.response?.data || error.message,
      code: error.response?.data?.code || "SERVER_ERROR",
    });
  }
};