/* Flaynity Welcome Email - EmailJS integration */
(function () {
    'use strict';

    const EMAILJS_PUBLIC_KEY = '3bjoHB3mpEfel9Dd3';
    const EMAILJS_SERVICE_ID = 'service_e3vye5y';
    const EMAILJS_TEMPLATE_ID = 'template_5jivxk8';
    const SENT_PREFIX = 'flaynity_welcome_email_sent_';

    function initEmailJS() {
        if (!window.emailjs) return false;
        try {
            window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
            return true;
        } catch (error) {
            console.error('Flaynity Welcome Email initialization failed:', error);
            return false;
        }
    }

    async function sendWelcomeEmail(user) {
        if (!user || !user.email || !window.emailjs) return false;

        const sentKey = SENT_PREFIX + String(user.uid || user.email).replace(/[^a-zA-Z0-9._-]/g, '_');
        if (localStorage.getItem(sentKey) === '1') return true;

        try {
            const userName = user.displayName || user.email.split('@')[0] || 'User';
            await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: user.email,
                user_name: userName,
                email: user.email
            });
            localStorage.setItem(sentKey, '1');
            console.log('Flaynity Welcome Email sent successfully.');
            return true;
        } catch (error) {
            console.error('Flaynity Welcome Email failed:', error);
            return false;
        }
    }

    initEmailJS();
    window.sendFlaynityWelcomeEmail = sendWelcomeEmail;
})();
