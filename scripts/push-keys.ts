/** Prints a new VAPID key pair for Web Push. Put them in your environment once; changing them unsubscribes everyone. */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=mailto:you@example.com`);
