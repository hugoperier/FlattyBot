import { testScoring } from './scoring.test';

async function runTests() {
    try {
        testScoring();
        // Add other tests here
        console.log('All tests completed.');
    } catch (error) {
        console.error('Tests failed:', error);
        process.exit(1);
    }
}

runTests();
