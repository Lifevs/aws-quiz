// server/db.js
// Polyfill fetch with node-fetch to fix UND_ERR_INVALID_ARG in Node 18+ undici with Appwrite SDK
const fetch = require('node-fetch');
global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

const sdk = require('node-appwrite');

const client = new sdk.Client();

// Configuration
const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
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
const DB_ID = process.env.APPWRITE_DB_ID || 'aws-db';

const initDB = async () => {
  try {
    console.log(`🔄 Checking Appwrite database... (Endpoint: ${endpoint}, Project: ${projectId})`);
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

    const ensureAttributes = async (collectionId, requiredAttributes) => {
      try {
        const col = await databases.getCollection(DB_ID, collectionId);
        const existingKeys = new Set(col.attributes.map(attr => attr.key));

        for (const attr of requiredAttributes) {
          if (!existingKeys.has(attr.key)) {
            console.log(`Creating missing attribute ${attr.key} in ${collectionId}...`);
            if (attr.type === 'string') {
              await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size, attr.required, attr.defaultValue);
            } else if (attr.type === 'integer') {
              await databases.createIntegerAttribute(DB_ID, collectionId, attr.key, attr.required, attr.min, attr.max, attr.defaultValue);
            } else if (attr.type === 'boolean') {
              await databases.createBooleanAttribute(DB_ID, collectionId, attr.key, attr.required, attr.defaultValue);
            } else if (attr.type === 'datetime') {
              await databases.createDatetimeAttribute(DB_ID, collectionId, attr.key, attr.required);
            }
            // Small sleep to prevent API race conditions
            await new Promise(r => setTimeout(r, 100));
          }
        }
      } catch (err) {
        console.error(`Error ensuring attributes for ${collectionId}:`, err.message);
      }
    };

    // 4. Exams Collection
    await createCollectionIfNotExists('exams', 'Exams');
    await ensureAttributes('exams', [
      { key: 'user_id', type: 'string', size: 50, required: true },
      { key: 'score', type: 'integer', required: true, min: 0, max: 100, defaultValue: 0 },
      { key: 'status', type: 'string', size: 20, required: true, defaultValue: 'in_progress' },
      { key: 'time_taken', type: 'integer', required: true, min: 0, max: 1000000, defaultValue: 0 },
      { key: 'total_questions', type: 'integer', required: true, min: 0, max: 1000, defaultValue: 0 },
      { key: 'correct_answers', type: 'integer', required: true, min: 0, max: 1000, defaultValue: 0 },
      { key: 'created_at', type: 'string', size: 50, required: true }
    ]);

    // 5. Exam Questions Collection
    await createCollectionIfNotExists('exam_questions', 'Exam Questions');
    await ensureAttributes('exam_questions', [
      { key: 'exam_id', type: 'string', size: 50, required: true },
      { key: 'question_index', type: 'integer', required: true, min: 0, max: 1000, defaultValue: 0 },
      { key: 'domain', type: 'string', size: 100, required: true },
      { key: 'question_text', type: 'string', size: 5000, required: true },
      { key: 'options', type: 'string', size: 5000, required: true },
      { key: 'correct_option', type: 'string', size: 10, required: true },
      { key: 'selected_option', type: 'string', size: 10, required: false },
      { key: 'explanation', type: 'string', size: 5000, required: true },
      { key: 'user_explanation', type: 'string', size: 5000, required: false },
      { key: 'understanding_score', type: 'integer', required: false, min: 0, max: 100, defaultValue: 0 },
      { key: 'mentor_feedback', type: 'string', size: 5000, required: false }
    ]);

    console.log('✅ Appwrite Database initialization complete.');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message || err);
    if (err.cause) console.error('Cause:', err.cause);
    throw err; // Re-throw so server.js catches it
  }
};

module.exports = { client, databases, DB_ID, sdk, initDB };
