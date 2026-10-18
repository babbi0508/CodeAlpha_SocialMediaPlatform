require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  console.warn("WARNING: Set SESSION_SECRET in your .env file before deployment.");
}
const sessionOptions = {
  secret: process.env.SESSION_SECRET || "local-development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 }
};
if (MONGODB_URI) {
  sessionOptions.store = MongoStore.create({ mongoUrl: MONGODB_URI, collectionName: "sessions" });
}
app.use(session(sessionOptions));
app.use(express.static(path.join(__dirname, "public")));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 20 },
  displayName: { type: String, required: true, trim: true, maxlength: 40 },
  passwordHash: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm using Connectly.", maxlength: 160 },
  createdAt: { type: Date, default: Date.now }
});
const postSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
});
const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: 250 },
  createdAt: { type: Date, default: Date.now }
});
const followSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  following: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
});
followSchema.index({ follower: 1, following: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);
const Comment = mongoose.model("Comment", commentSchema);
const Follow = mongoose.model("Follow", followSchema);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in first." });
  next();
}
function publicUser(user) {
  return { id: String(user._id), username: user.username, displayName: user.displayName, bio: user.bio || "", createdAt: user.createdAt };
}
async function currentUser(req) {
  if (!req.session.userId) return null;
  return User.findById(req.session.userId);
}

app.get("/api/health", (req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "not connected" }));

app.get("/api/me", async (req, res, next) => {
  try { const user = await currentUser(req); res.json({ user: user ? publicUser(user) : null }); }
  catch (err) { next(err); }
});

app.post("/api/register", async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.displayName || "").trim();
    const password = String(req.body.password || "");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: "Username must be 3–20 characters (letters, numbers, underscore)." });
    if (displayName.length < 2 || displayName.length > 40) return res.status(400).json({ error: "Display name must be 2–40 characters." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: "That username is already taken." });
    const user = await User.create({ username, displayName, passwordHash: await bcrypt.hash(password, 10) });
    req.session.userId = String(user._id);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "That username is already taken." });
    next(err);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Incorrect username or password." });
    req.session.userId = String(user._id);
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

app.post("/api/logout", (req, res) => req.session.destroy(err => {
  if (err) return res.status(500).json({ error: "Could not log out." });
  res.clearCookie("connect.sid");
  res.json({ ok: true });
}));

app.get("/api/users", requireAuth, async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.session.userId } }).select("username displayName bio createdAt").sort({ createdAt: -1 });
    const follows = await Follow.find({ follower: req.session.userId }).select("following");
    const followingIds = new Set(follows.map(f => String(f.following)));
    const results = await Promise.all(users.map(async user => ({
      ...publicUser(user),
      isFollowing: followingIds.has(String(user._id)),
      followers: await Follow.countDocuments({ following: user._id }),
      following: await Follow.countDocuments({ follower: user._id })
    })));
    res.json(results);
  } catch (err) { next(err); }
});

app.patch("/api/profile", requireAuth, async (req, res, next) => {
  try {
    const bio = String(req.body.bio || "").trim().slice(0, 160);
    const user = await User.findByIdAndUpdate(req.session.userId, { bio }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

app.get("/api/posts", requireAuth, async (req, res, next) => {
  try {
    const posts = await Post.find().populate("user", "username displayName").sort({ createdAt: -1 }).lean();
    const postIds = posts.map(p => p._id);
    const comments = await Comment.find({ post: { $in: postIds } }).populate("user", "username displayName").sort({ createdAt: 1 }).lean();
    const commentsByPost = new Map();
    for (const comment of comments) {
      const key = String(comment.post);
      if (!commentsByPost.has(key)) commentsByPost.set(key, []);
      commentsByPost.get(key).push({ id: String(comment._id), text: comment.text, createdAt: comment.createdAt, author: comment.user?.displayName || "Unknown user", username: comment.user?.username || "unknown" });
    }
    res.json(posts.map(post => ({
      id: String(post._id), text: post.text, createdAt: post.createdAt,
      author: post.user ? { id: String(post.user._id), username: post.user.username, displayName: post.user.displayName } : { username: "unknown", displayName: "Unknown user" },
      likes: post.likedBy.length, likedByMe: post.likedBy.some(id => String(id) === req.session.userId),
      comments: commentsByPost.get(String(post._id)) || []
    })));
  } catch (err) { next(err); }
});

app.post("/api/posts", requireAuth, async (req, res, next) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text || text.length > 500) return res.status(400).json({ error: "Post must contain 1–500 characters." });
    const post = await Post.create({ user: req.session.userId, text });
    res.status(201).json({ post: { id: String(post._id), text: post.text, createdAt: post.createdAt } });
  } catch (err) { next(err); }
});

app.post("/api/posts/:id/like", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found." });
    const userId = String(req.session.userId);
    const index = post.likedBy.findIndex(id => String(id) === userId);
    if (index >= 0) post.likedBy.splice(index, 1);
    else post.likedBy.push(req.session.userId);
    await post.save();
    res.json({ liked: index < 0, likes: post.likedBy.length });
  } catch (err) { next(err); }
});

app.post("/api/posts/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text || text.length > 250) return res.status(400).json({ error: "Comment must contain 1–250 characters." });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found." });
    await Comment.create({ post: post._id, user: req.session.userId, text });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

app.post("/api/users/:id/follow", requireAuth, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.isValidObjectId(targetId)) return res.status(400).json({ error: "Invalid user ID." });
    if (targetId === req.session.userId) return res.status(400).json({ error: "You cannot follow yourself." });
    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: "User not found." });
    const existing = await Follow.findOne({ follower: req.session.userId, following: targetId });
    if (existing) {
      await existing.deleteOne();
      return res.json({ following: false });
    }
    try { await Follow.create({ follower: req.session.userId, following: targetId }); }
    catch (err) { if (err.code !== 11000) throw err; }
    res.json({ following: true });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Server error. Check the terminal for details." });
});

async function start() {
  if (!MONGODB_URI) {
    console.error("\nMissing MONGODB_URI. Copy .env.example to .env and configure MongoDB first.\n");
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected.");
    app.listen(PORT, () => console.log(`Connectly is running at http://localhost:${PORT}`));
  } catch (error) {
    console.error("Could not connect to MongoDB. Check MONGODB_URI and your network/database status.\n", error.message);
    process.exit(1);
  }
}
start();
