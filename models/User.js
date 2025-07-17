import mongoose from 'mongoose';

// Define the User schema
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    // Add any other properties related to a user here
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;