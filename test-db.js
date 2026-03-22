import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  try {
    await getDocs(collection(db, 'tasks'));
    console.log('Success');
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
