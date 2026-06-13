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
        const collectionName = col.name || collectionId;
        const existingMap = new Map(col.attributes.map(attr => [attr.key, attr]));

        let needsRecreate = false;
        const missing = [];

        for (const req of requiredAttributes) {
          const existing = existingMap.get(req.key);
          if (!existing) {
            missing.push(req);
          } else if (req.type === 'string' && existing.size < req.size) {
            console.log(`⚠️ Attribute size mismatch for ${collectionId}.${req.key}: DB size ${existing.size} < required size ${req.size}. Triggering recreate.`);
            needsRecreate = true;
          }
        }

        if (needsRecreate) {
          console.warn(`⚠️ Size mismatch detected for collection ${collectionId}. Force-recreating collection to apply larger sizes...`);
          // 1. Delete old collection
          try {
            await databases.deleteCollection(DB_ID, collectionId);
            console.log(`Successfully deleted collection ${collectionId}`);
          } catch (delErr) {
            console.warn(`Error deleting collection ${collectionId}:`, delErr.message);
          }
          await new Promise(r => setTimeout(r, 2000)); // Wait for deletion to complete

          // 2. Re-create collection
          await databases.createCollection(DB_ID, collectionId, collectionName);
          await new Promise(r => setTimeout(r, 1000));

          // 3. Re-create all attributes from scratch with updated sizes
          for (const newAttr of requiredAttributes) {
            try {
              console.log(`Re-creating attribute ${newAttr.key} in empty ${collectionId}...`);
              if (newAttr.type === 'string') {
                await databases.createStringAttribute(DB_ID, collectionId, newAttr.key, newAttr.size, false, newAttr.defaultValue);
              } else if (newAttr.type === 'integer') {
                await databases.createIntegerAttribute(DB_ID, collectionId, newAttr.key, false, newAttr.min, newAttr.max, newAttr.defaultValue);
              } else if (newAttr.type === 'boolean') {
                await databases.createBooleanAttribute(DB_ID, collectionId, newAttr.key, false, newAttr.defaultValue);
              } else if (newAttr.type === 'datetime') {
                await databases.createDatetimeAttribute(DB_ID, collectionId, newAttr.key, false);
              }
              await new Promise(r => setTimeout(r, 200));
            } catch (recreateErr) {
              console.error(`Failed to recreate attribute ${newAttr.key} in ${collectionId}:`, recreateErr.message);
            }
          }
          return;
        }

        if (missing.length > 0) {
          console.log(`Detected ${missing.length} missing attributes in ${collectionId}. Cleaning up documents...`);
          try {
            let hasMore = true;
            while (hasMore) {
              const docs = await databases.listDocuments(DB_ID, collectionId, [sdk.Query.limit(100)]);
              if (docs.documents.length === 0) {
                hasMore = false;
              } else {
                for (const doc of docs.documents) {
                  await databases.deleteDocument(DB_ID, collectionId, doc.$id);
                }
              }
            }
          } catch (cleanErr) {
            console.warn(`Clean error:`, cleanErr.message);
          }

          for (const attr of missing) {
            try {
              console.log(`Creating missing attribute ${attr.key} in ${collectionId}...`);
              if (attr.type === 'string') {
                await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size, false, attr.defaultValue);
              } else if (attr.type === 'integer') {
                await databases.createIntegerAttribute(DB_ID, collectionId, attr.key, false, attr.min, attr.max, attr.defaultValue);
              } else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(DB_ID, collectionId, attr.key, false, attr.defaultValue);
              } else if (attr.type === 'datetime') {
                await databases.createDatetimeAttribute(DB_ID, collectionId, attr.key, false);
              }
              // Small sleep to prevent API race conditions
              await new Promise(r => setTimeout(r, 200));
            } catch (err) {
              const errMsg = (err.message || '').toLowerCase();
              if (
                errMsg.includes('maximum') ||
                errMsg.includes('limit') ||
                errMsg.includes('row size') ||
                errMsg.includes('attribute') ||
                (err.code && err.code === 400)
              ) {
                console.warn(`⚠️ Row size/attribute limit reached for collection ${collectionId}. Force-recreating collection with updated sizes...`);

                // 1. Delete old collection
                try {
                  await databases.deleteCollection(DB_ID, collectionId);
                  console.log(`Successfully deleted collection ${collectionId}`);
                } catch (delErr) {
                  console.warn(`Error deleting collection ${collectionId}:`, delErr.message);
                }
                await new Promise(r => setTimeout(r, 2000)); // Wait for deletion to complete

                // 2. Re-create collection
                await databases.createCollection(DB_ID, collectionId, collectionName);
                await new Promise(r => setTimeout(r, 1000));

                // 3. Re-create all attributes from scratch with updated sizes
                for (const newAttr of requiredAttributes) {
                  try {
                    console.log(`Re-creating attribute ${newAttr.key} in empty ${collectionId}...`);
                    if (newAttr.type === 'string') {
                      await databases.createStringAttribute(DB_ID, collectionId, newAttr.key, newAttr.size, false, newAttr.defaultValue);
                    } else if (newAttr.type === 'integer') {
                      await databases.createIntegerAttribute(DB_ID, collectionId, newAttr.key, false, newAttr.min, newAttr.max, newAttr.defaultValue);
                    } else if (newAttr.type === 'boolean') {
                      await databases.createBooleanAttribute(DB_ID, collectionId, newAttr.key, false, newAttr.defaultValue);
                    } else if (newAttr.type === 'datetime') {
                      await databases.createDatetimeAttribute(DB_ID, collectionId, newAttr.key, false);
                    }
                    await new Promise(r => setTimeout(r, 200));
                  } catch (recreateErr) {
                    console.error(`Failed to recreate attribute ${newAttr.key} in ${collectionId}:`, recreateErr.message);
                  }
                }
                break; // Break loop since we recreated and loaded all attributes
              } else {
                throw err;
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error ensuring attributes for ${collectionId}:`, err.message);
      }
    };

    // 4. Exams Collection
    await createCollectionIfNotExists('exams', 'Exams');
    await ensureAttributes('exams', [
      { key: 'user_id', type: 'string', size: 50, required: false },
      { key: 'score', type: 'integer', required: false, min: 0, max: 100, defaultValue: 0 },
      { key: 'status', type: 'string', size: 20, required: false, defaultValue: 'in_progress' },
      { key: 'time_taken', type: 'integer', required: false, min: 0, max: 1000000, defaultValue: 0 },
      { key: 'total_questions', type: 'integer', required: false, min: 0, max: 1000, defaultValue: 0 },
      { key: 'correct_answers', type: 'integer', required: false, min: 0, max: 1000, defaultValue: 0 },
      { key: 'created_at', type: 'string', size: 50, required: false }
    ]);

    // 5. Exam Questions Collection
    await createCollectionIfNotExists('exam_questions', 'Exam Questions');
    await ensureAttributes('exam_questions', [
      { key: 'exam_id', type: 'string', size: 50, required: false },
      { key: 'question_index', type: 'integer', required: false, min: 0, max: 1000, defaultValue: 0 },
      { key: 'domain', type: 'string', size: 100, required: false },
      { key: 'question_text', type: 'string', size: 2000, required: false },
      { key: 'options', type: 'string', size: 2000, required: false },
      { key: 'correct_option', type: 'string', size: 10, required: false },
      { key: 'selected_option', type: 'string', size: 10, required: false },
      { key: 'explanation', type: 'string', size: 5000, required: false },
      { key: 'user_explanation', type: 'string', size: 2000, required: false },
      { key: 'understanding_score', type: 'integer', required: false, min: 0, max: 100, defaultValue: 0 },
      { key: 'mentor_feedback', type: 'string', size: 2500, required: false }
    ]);

    console.log('✅ Appwrite Database initialization complete.');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message || err);
    if (err.cause) console.error('Cause:', err.cause);
    throw err; // Re-throw so server.js catches it
  }
};

module.exports = { client, databases, DB_ID, sdk, initDB };
