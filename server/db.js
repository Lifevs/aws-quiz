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
      } catch (e) {
        if (e.code === 404) {
          console.log(`Creating collection ${collectionId}...`);
          await databases.createCollection(DB_ID, collectionId, name);
        } else {
          throw e;
        }
      }
    };

    // Attribute creation helpers to ignore 409 (Already Exists) conflicts
    const createStringAttr = async (collId, key, size, required, defValue) => {
      try {
        await databases.createStringAttribute(DB_ID, collId, key, size, required, defValue);
        console.log(`   + Attribute string:${key} created.`);
      } catch (e) {
        if (e.code !== 409) throw e;
      }
    };

    const createIntegerAttr = async (collId, key, required, min, max, defValue) => {
      try {
        await databases.createIntegerAttribute(DB_ID, collId, key, required, min, max, defValue);
        console.log(`   + Attribute int:${key} created.`);
      } catch (e) {
        if (e.code !== 409) throw e;
      }
    };

    const createBooleanAttr = async (collId, key, required, defValue) => {
      try {
        await databases.createBooleanAttribute(DB_ID, collId, key, required, defValue);
        console.log(`   + Attribute bool:${key} created.`);
      } catch (e) {
        if (e.code !== 409) throw e;
      }
    };

    const createEmailAttr = async (collId, key, required) => {
      try {
        await databases.createEmailAttribute(DB_ID, collId, key, required);
        console.log(`   + Attribute email:${key} created.`);
      } catch (e) {
        if (e.code !== 409) throw e;
      }
    };

    const createDatetimeAttr = async (collId, key, required) => {
      try {
        await databases.createDatetimeAttribute(DB_ID, collId, key, required);
        console.log(`   + Attribute datetime:${key} created.`);
      } catch (e) {
        if (e.code !== 409) throw e;
      }
    };

    // 1. Users Collection
    await createCollectionIfNotExists('users', 'Users');
    console.log('Initializing users attributes...');
    await createStringAttr('users', 'name', 100, true);
    await createEmailAttr('users', 'email', true);
    await createStringAttr('users', 'password_hash', 255, true);
    await createDatetimeAttr('users', 'created_at', false);
    await createDatetimeAttr('users', 'last_login', false);

    // 2. Service Progress Collection
    await createCollectionIfNotExists('service_progress', 'Service Progress');
    console.log('Initializing service_progress attributes...');
    await createStringAttr('service_progress', 'user_id', 50, true);
    await createStringAttr('service_progress', 'service_id', 50, true);
    await createStringAttr('service_progress', 'service_name', 100, true);
    await createIntegerAttr('service_progress', 'questions_attempted', false, 0, 1000000, 0);
    await createIntegerAttr('service_progress', 'questions_correct', false, 0, 1000000, 0);
    await createStringAttr('service_progress', 'current_difficulty', 20, false, 'foundation');
    await createIntegerAttr('service_progress', 'consecutive_correct', false, 0, 1000000, 0);
    await createIntegerAttr('service_progress', 'consecutive_wrong', false, 0, 1000000, 0);
    await createIntegerAttr('service_progress', 'best_streak', false, 0, 1000000, 0);
    await createIntegerAttr('service_progress', 'current_streak', false, 0, 1000000, 0);
    await createIntegerAttr('service_progress', 'total_score', false, 0, 10000000, 0);
    await createDatetimeAttr('service_progress', 'last_played', false);
    await createBooleanAttr('service_progress', 'is_completed', false, false);

    // 3. Question History Collection
    await createCollectionIfNotExists('question_history', 'Question History');
    console.log('Initializing question_history attributes...');
    await createStringAttr('question_history', 'user_id', 50, true);
    await createStringAttr('question_history', 'service_id', 50, true);
    await createStringAttr('question_history', 'question_hash', 64, true);
    await createBooleanAttr('question_history', 'was_correct', false);
    await createStringAttr('question_history', 'difficulty', 20, false);
    await createDatetimeAttr('question_history', 'asked_at', false);

    // 4. Exams Collection
    await createCollectionIfNotExists('exams', 'Exams');
    console.log('Initializing exams attributes...');
    await createStringAttr('exams', 'user_id', 50, true);
    await createIntegerAttr('exams', 'score', false, 0, 100, 0);
    await createStringAttr('exams', 'status', 20, false, 'in_progress');
    await createIntegerAttr('exams', 'time_taken', false, 0, 1000000, 0);
    await createIntegerAttr('exams', 'total_questions', true, 0, 1000);
    await createIntegerAttr('exams', 'correct_answers', false, 0, 1000, 0);
    await createStringAttr('exams', 'created_at', 50, true);

    // 5. Exam Questions Collection
    await createCollectionIfNotExists('exam_questions', 'Exam Questions');
    console.log('Initializing exam_questions attributes...');
    await createStringAttr('exam_questions', 'exam_id', 50, true);
    await createIntegerAttr('exam_questions', 'question_index', true, 0, 1000);
    await createStringAttr('exam_questions', 'domain', 100, true);
    await createStringAttr('exam_questions', 'question_text', 5000, true);
    await createStringAttr('exam_questions', 'options', 5000, true);
    await createStringAttr('exam_questions', 'correct_option', 10, true);
    await createStringAttr('exam_questions', 'selected_option', 10, false);
    await createStringAttr('exam_questions', 'explanation', 5000, true);
    await createStringAttr('exam_questions', 'user_explanation', 5000, false);
    await createIntegerAttr('exam_questions', 'understanding_score', false, 0, 100, 0);
    await createStringAttr('exam_questions', 'mentor_feedback', 5000, false);

    console.log('✅ Appwrite Database initialization complete.');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message || err);
    if (err.cause) console.error('Cause:', err.cause);
    throw err; // Re-throw so server.js catches it
  }
};

module.exports = { client, databases, DB_ID, sdk, initDB };
