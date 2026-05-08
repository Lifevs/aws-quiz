// server/db.js
const sdk = require('node-appwrite');

const client = new sdk.Client();

// Configuration
const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || 'aws-quiz'; // Default if not provided
const apiKey = process.env.DATABASE_URL; // User explicitly said API key is here

if (endpoint && projectId && apiKey) {
  client
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
} else {
  console.warn('⚠️ Appwrite configuration missing. Ensure DATABASE_URL (API Key) is set.');
}

const databases = new sdk.Databases(client);
const DB_ID = 'aws-db';

const initDB = async () => {
  try {
    console.log('🔄 Checking Appwrite database...');
    try {
      await databases.get(DB_ID);
      console.log(`✅ Database ${DB_ID} exists.`);
    } catch (e) {
      if (e.code === 404) {
        console.log(`Creating database ${DB_ID}...`);
        await databases.create(DB_ID, DB_ID);
      } else {
        throw e;
      }
    }

    const createCollectionIfNotExists = async (collectionId, name) => {
      try {
        await databases.getCollection(DB_ID, collectionId);
        console.log(`✅ Collection ${collectionId} exists.`);
        return false;
      } catch (e) {
        if (e.code === 404) {
          console.log(`Creating collection ${collectionId}...`);
          await databases.createCollection(DB_ID, collectionId, name);
          return true; 
        } else {
          throw e;
        }
      }
    };

    // 1. Users Collection
    const isNewUsers = await createCollectionIfNotExists('users', 'Users');
    if (isNewUsers) {
      console.log('Creating attributes for users...');
      await databases.createStringAttribute(DB_ID, 'users', 'name', 100, true);
      await databases.createEmailAttribute(DB_ID, 'users', 'email', true);
      await databases.createStringAttribute(DB_ID, 'users', 'password_hash', 255, true);
      await databases.createDatetimeAttribute(DB_ID, 'users', 'created_at', false);
      await databases.createDatetimeAttribute(DB_ID, 'users', 'last_login', false);
    }

    // 2. Service Progress Collection
    const isNewProgress = await createCollectionIfNotExists('service_progress', 'Service Progress');
    if (isNewProgress) {
      console.log('Creating attributes for service_progress...');
      await databases.createStringAttribute(DB_ID, 'service_progress', 'user_id', 50, true);
      await databases.createStringAttribute(DB_ID, 'service_progress', 'service_id', 50, true);
      await databases.createStringAttribute(DB_ID, 'service_progress', 'service_name', 100, true);
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'questions_attempted', false, 0, 1000000, 0);
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'questions_correct', false, 0, 1000000, 0);
      await databases.createStringAttribute(DB_ID, 'service_progress', 'current_difficulty', 20, false, 'foundation');
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'consecutive_correct', false, 0, 1000000, 0);
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'consecutive_wrong', false, 0, 1000000, 0);
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'best_streak', false, 0, 1000000, 0);
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'current_streak', false, 0, 1000000, 0);
      await databases.createIntegerAttribute(DB_ID, 'service_progress', 'total_score', false, 0, 10000000, 0);
      await databases.createDatetimeAttribute(DB_ID, 'service_progress', 'last_played', false);
      await databases.createBooleanAttribute(DB_ID, 'service_progress', 'is_completed', false, false);
    }

    // 3. Question History Collection
    const isNewHistory = await createCollectionIfNotExists('question_history', 'Question History');
    if (isNewHistory) {
      console.log('Creating attributes for question_history...');
      await databases.createStringAttribute(DB_ID, 'question_history', 'user_id', 50, true);
      await databases.createStringAttribute(DB_ID, 'question_history', 'service_id', 50, true);
      await databases.createStringAttribute(DB_ID, 'question_history', 'question_hash', 64, true);
      await databases.createBooleanAttribute(DB_ID, 'question_history', 'was_correct', false);
      await databases.createStringAttribute(DB_ID, 'question_history', 'difficulty', 20, false);
      await databases.createDatetimeAttribute(DB_ID, 'question_history', 'asked_at', false);
    }

    console.log('✅ Appwrite Database initialization complete. (Note: Appwrite processes new attributes in the background. Wait a moment before querying.)');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message || err);
  }
};

module.exports = { client, databases, DB_ID, sdk, initDB };
