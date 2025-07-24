import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// Get credentials from environment variables
const clientId ='77igg9177iv3cg';
const clientSecret = 'WPL_AP1.GNjqyb561TVVw4fl.hq53NA=='
const redirectUri = 'https://cross-poster-fe.vercel.app/auth/linkedin/callback';

export const generateState = () => crypto.randomBytes(16).toString("hex");

// Function to get LinkedIn OAuth URL for authorization
export const getLinkedInAuthUrl = () => {
  const scope = "openid profile w_member_social email";
  const state = Math.random().toString(36).substring(2, 15);
  return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scope)}&state=${state}`;
};
// Function to exchange authorization code for access token
export const getAccessToken = async (code) => {
  try {
    const response = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(
      "Error exchanging authorization code for access token:",
      error.response?.data || error.message
    );
    throw error;
  }
};
// Function to post something to LinkedIn (example)
export const postToLinkedIn = async (accessToken, postData) => {
  try {
    const response = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      postData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      "Error posting to LinkedIn:",
      error.response?.data || error.message
    );
    throw error;
  }
};