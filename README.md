# Connectly — CodeAlpha Task 2: Social Media Platform

Full-stack mini social media app using the required frontend technologies (HTML, CSS, JavaScript), Express.js backend, and MongoDB database.

## Features
- User registration and login
- Password hashing with bcryptjs
- Session-based authentication; session records stored in MongoDB when configured
- User profile and editable bio
- Create posts
- Like/unlike posts
- Add comments
- Discover users and follow/unfollow them
- MongoDB collections/models for users, posts, comments, and follows
- Responsive UI

## Setup

### 1. Install prerequisites
- Install Node.js LTS: https://nodejs.org/
- Create a MongoDB database. Beginner-friendly option: MongoDB Atlas (cloud) or local MongoDB.
- For Atlas, create a database user, allow your current IP address in Network Access, and copy the Node.js connection string. Do not share your password publicly.

### 2. Configure environment
In the project folder, copy `.env.example` and name the copy `.env`.
Open `.env` and set:
```env
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_CLUSTER/connectly?retryWrites=true&w=majority
SESSION_SECRET=put-a-long-random-secret-here
PORT=3000
```
Replace the example URI with your real MongoDB connection string. Do not upload `.env` to GitHub.

For local MongoDB, the URI can be:
`mongodb://127.0.0.1:27017/connectly`

### 3. Install and run
Open this folder in VS Code, then Terminal → New Terminal:
```bash
npm install
npm start
```
Open `http://localhost:3000`.

The server intentionally does not start until a valid MongoDB URI is configured, so the app does not silently fall back to JSON storage.

## Test checklist
1. Register a user.
2. Update the profile bio.
3. Create a post.
4. Like and unlike the post.
5. Add a comment.
6. Register a second user in another browser/incognito window.
7. Use Discover people to follow/unfollow the other user.
8. Restart the server and confirm records remain in MongoDB.

## Notes before submission
- This is a learning project, not production-hardened. Before public deployment, add CSRF protection, rate limiting, stronger validation, secure production session configuration, and review privacy/security settings.
- Ensure MongoDB is actually connected and test all features before submitting.
- Upload source code to a GitHub repository named `CodeAlpha_SocialMediaPlatform`.
- Do not upload `.env` or database credentials.
- Follow the exact submission form and deadline shared by your internship coordinator.
