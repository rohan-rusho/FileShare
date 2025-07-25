// Firebase Configuration
export const firebaseConfig = {
    apiKey: "AIzaSyDxasCuJjMMfoQSYf3Ew576l8Htd3Mj898",
    authDomain: "rusho-s-server-210a6.firebaseapp.com",
    projectId: "rusho-s-server-210a6",
    storageBucket: "rusho-s-server-210a6.firebasestorage.app",
    messagingSenderId: "993549634147",
    appId: "1:993549634147:web:0398bd92bc63da8c69c656"
};

// Application Configuration
export const appConfig = {
    maxFileSize: 50 * 1024 * 1024, // 50MB in bytes
    maxLoginAttempts: 5,
    lockoutTime: 15 * 60 * 1000, // 15 minutes in milliseconds
    supportedFileTypes: {
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'ico', 'heic', 'raw'],
        documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'md', 'epub'],
        videos: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'mpg', 'mpeg', 'm4v'],
        audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
        applications: ['apk', 'exe', 'dmg', 'app', 'msi', 'deb', 'rpm'],
        archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tar.gz', 'tar.bz2', 'tar.xz'],
        code: ['js', 'ts', 'html', 'css', 'php', 'py', 'java', 'cpp', 'c', 'h', 'json', 'xml', 'yaml', 'yml'],
        fonts: ['ttf', 'otf', 'woff', 'woff2', 'eot']
    }
};
