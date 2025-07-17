import mongoose from 'mongoose';

// Define the Post schema
const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Associate post with a user
      required: true,
    },
    // Add any other properties related to a post here
  },
  { timestamps: true }
);

// Create the Post model
const Post = mongoose.model('Post', postSchema);

export default Post;