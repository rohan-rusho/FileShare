// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, limit, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { firebaseConfig, appConfig } from './firebase-config.js';
import { getDatabase, ref as dbRef, set as dbSet } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const realtimeDb = getDatabase(app);

// Debug logging
console.log('Firebase initialized successfully');
console.log('Auth domain:', firebaseConfig.authDomain);
console.log('Project ID:', firebaseConfig.projectId);

// Application state
let currentUser = null;
let userData = null;
let files = [];
let currentView = 'gallery';
let currentFilter = 'all';
let searchQuery = '';

// Upload tracking to prevent duplicates
let activeUploads = new Set();
let uploadInProgress = false;

// Rate limiting for login attempts (from config)
let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = appConfig.maxLoginAttempts;
const LOCKOUT_TIME = appConfig.lockoutTime;
let lockoutTime = 0;

// DOM elements
const loadingScreen = document.getElementById('loading-screen');
const authContainer = document.getElementById('auth-container');
const mainContainer = document.getElementById('main-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authSwitchLink = document.getElementById('auth-switch-link');
const authSwitchText = document.getElementById('auth-switch-text');
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const galleryViewBtn = document.getElementById('gallery-view-btn');
const listViewBtn = document.getElementById('list-view-btn');
const fileFilter = document.getElementById('file-filter');
const searchInput = document.getElementById('search-input');
const filesContainer = document.getElementById('files-container');
const emptyState = document.getElementById('empty-state');
const deleteModal = document.getElementById('delete-modal');
const deleteModalClose = document.getElementById('delete-modal-close');
const deleteFileName = document.getElementById('delete-file-name');
const cancelDelete = document.getElementById('cancel-delete');
const confirmDelete = document.getElementById('confirm-delete');
const toastContainer = document.getElementById('toast-container');

// Check if required DOM elements exist
const requiredElements = {
    loadingScreen, authContainer, mainContainer, loginForm, registerForm,
    authSwitchLink, authSwitchText, userDisplayName, logoutBtn, uploadArea,
    fileInput, uploadProgress, progressFill, progressText, galleryViewBtn,
    listViewBtn, fileFilter, searchInput, filesContainer, emptyState,
    deleteModal, deleteModalClose, deleteFileName, cancelDelete, confirmDelete,
    toastContainer
};

for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
        console.error(`Required DOM element not found: ${name}`);
    }
}

// Utility functions
const showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fas fa-check-circle' :
        type === 'error' ? 'fas fa-exclamation-circle' :
            type === 'warning' ? 'fas fa-exclamation-triangle' :
                'fas fa-info-circle';

    toast.innerHTML = `
        <i class="toast-icon ${icon}"></i>
        <span class="toast-message">${message}</span>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    toastContainer.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.remove();
    }, 4000);

    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
};

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();

    // Check each category from appConfig
    for (const [category, extensions] of Object.entries(appConfig.supportedFileTypes)) {
        if (extensions.includes(ext)) {
            return category;
        }
    }

    return 'other';
};

const getFileIcon = (type) => {
    const icons = {
        images: 'fas fa-image',
        documents: 'fas fa-file-alt',
        videos: 'fas fa-video',
        audio: 'fas fa-music',
        applications: 'fas fa-mobile-alt',
        archives: 'fas fa-file-archive',
        code: 'fas fa-code',
        fonts: 'fas fa-font',
        other: 'fas fa-file'
    };
    return icons[type] || 'fas fa-file';
};

// Authentication functions
const handleLogin = async (e) => {
    e.preventDefault();
    console.log('Login form submitted');

    // Check rate limiting
    if (Date.now() < lockoutTime) {
        const remainingTime = Math.ceil((lockoutTime - Date.now()) / 1000 / 60);
        showToast(`Too many login attempts. Please wait ${remainingTime} minutes.`, 'error');
        return;
    }

    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        lockoutTime = Date.now() + LOCKOUT_TIME;
        showToast('Too many login attempts. Account locked for 15 minutes.', 'error');
        return;
    }

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    console.log('Login attempt for username:', username);

    if (!username || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    try {
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';

        // Use username as email for Firebase Auth  
        const email = `${username}@fileserver.local`;

        console.log('Attempting Firebase authentication...');
        console.log('Email:', email);
        console.log('Password length:', password.length);

        await signInWithEmailAndPassword(auth, email, password);
        loginAttempts = 0; // Reset on successful login
        console.log('Login successful!');

    } catch (error) {
        console.error('Login error details:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        loginAttempts++;

        let errorMessage = 'Login failed. Please try again.';

        if (error.code === 'auth/user-not-found') {
            errorMessage = 'Username not found. Please check your username or sign up.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid username format.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Please try again later.';
        } else if (error.code === 'auth/configuration-not-found') {
            errorMessage = 'Firebase Authentication is not properly configured. Please enable Email/Password authentication in Firebase Console.';
        } else if (error.code === 'auth/api-key-not-valid') {
            errorMessage = 'Invalid Firebase API key. Please check your Firebase configuration.';
        } else if (error.code === 'auth/project-not-found') {
            errorMessage = 'Firebase project not found. Please check your project configuration.';
        } else if (error.message) {
            errorMessage = `Login failed: ${error.message}`;
        }

        showToast(errorMessage, 'error');

        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
};

const handleRegister = async (e) => {
    e.preventDefault();
    console.log('Register form submitted');

    const username = document.getElementById('register-username').value;
    const name = document.getElementById('register-name').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    console.log('Registration data:', { username, name, password: password ? '***' : 'empty', confirmPassword: confirmPassword ? '***' : 'empty' });

    if (!username || !name || !password || !confirmPassword) {
        console.log('Missing fields');
        showToast('Please fill in all fields', 'error');
        return;
    }

    if (password !== confirmPassword) {
        console.log('Passwords do not match');
        showToast('Passwords do not match', 'error');
        return;
    }

    if (password.length < 6) {
        console.log('Password too short');
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    console.log('Starting registration process...');

    try {
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';

        // Use username as email for Firebase Auth
        const email = `${username}@fileserver.local`;

        console.log('Creating user with Firebase...');
        console.log('Email:', email);
        console.log('Password length:', password.length);

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log('User created successfully:', user.uid);

        // Update user profile with display name
        await updateProfile(user, {
            displayName: name
        });

        console.log('User profile updated');

        // Save user data to Firestore only (remove Realtime Database for now)
        try {
            await saveUserData(user, name, username, password);
            console.log('User data saved to Firestore');
        } catch (firestoreError) {
            console.warn('Firestore save failed, but user account was created:', firestoreError);
            // Continue anyway, the user account exists
        }

        showToast('Account created successfully! Welcome to your file server.', 'success');

        // Don't auto-login here, Firebase auth state will handle it automatically
        console.log('Registration successful, waiting for auth state change...');

    } catch (error) {
        console.error('Registration error details:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        let errorMessage = 'Registration failed. Please try again.';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This username is already taken. Please choose another.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password must be at least 6 characters long.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid username format. Please try a different username.';
        } else if (error.code === 'auth/operation-not-allowed') {
            errorMessage = 'Email/password sign-up is not enabled. Please contact administrator.';
        } else if (error.code === 'auth/configuration-not-found') {
            errorMessage = 'Firebase Authentication is not properly configured. Please enable Email/Password authentication in Firebase Console.';
        } else if (error.code === 'auth/api-key-not-valid') {
            errorMessage = 'Invalid Firebase API key. Please check your Firebase configuration.';
        } else if (error.code === 'auth/project-not-found') {
            errorMessage = 'Firebase project not found. Please check your project configuration.';
        } else if (error.message) {
            errorMessage = `Registration failed: ${error.message}`;
        }

        showToast(errorMessage, 'error');

        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
    }
};

const handleLogout = async () => {
    try {
        await signOut(auth);
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed', 'error');
    }
};

const toggleAuthMode = () => {
    console.log('Toggle auth mode called');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authSwitchText = document.getElementById('auth-switch-text');

    if (!loginForm || !registerForm || !authSwitchText) {
        console.error('Forms not found:', { loginForm, registerForm, authSwitchText });
        return;
    }

    const isLoginMode = !loginForm.classList.contains('hidden');
    console.log('Current mode - Login:', isLoginMode);

    if (isLoginMode) {
        console.log('Switching to register mode');
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authSwitchText.innerHTML = 'Already have an account? <a href="#" id="auth-switch-link">Sign in</a>';
    } else {
        console.log('Switching to login mode');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        authSwitchText.innerHTML = 'Don\'t have an account? <a href="#" id="auth-switch-link">Sign up</a>';
    }

    // Re-attach event listener to the new link
    setTimeout(() => {
        const newAuthSwitchLink = document.getElementById('auth-switch-link');
        if (newAuthSwitchLink) {
            newAuthSwitchLink.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Auth switch link clicked after toggle');
                toggleAuthMode();
            });
            console.log('Event listener re-attached successfully');
        } else {
            console.error('Auth switch link not found after toggle');
        }
    }, 100);
};

// File upload functions
const handleFileUpload = async (files) => {
    console.log('handleFileUpload called with', files?.length || 0, 'files');

    if (!files || files.length === 0) {
        console.log('No files provided, exiting');
        return;
    }

    // Check if an upload is already in progress
    if (uploadInProgress) {
        console.log('Upload already in progress, ignoring duplicate call');
        showToast('Upload already in progress, please wait...', 'warning');
        return;
    }

    uploadInProgress = true;
    const MAX_FILE_SIZE = appConfig.maxFileSize; // From config
    console.log('Processing', files.length, 'file(s) for upload');

    try {
        for (const file of files) {
            const fileKey = `${file.name}_${file.size}_${file.lastModified}`;

            if (activeUploads.has(fileKey)) {
                console.log('File already being uploaded:', file.name);
                showToast(`File ${file.name} is already being uploaded`, 'warning');
                continue;
            }

            console.log('Processing file:', file.name, 'Size:', formatFileSize(file.size));

            if (file.size > MAX_FILE_SIZE) {
                console.warn('File too large:', file.name);
                showToast(`File ${file.name} is too large. Maximum size is 50MB.`, 'error');
                continue;
            }

            activeUploads.add(fileKey);

            try {
                await uploadFile(file);
            } finally {
                activeUploads.delete(fileKey);
            }
        }
    } finally {
        uploadInProgress = false;
        console.log('handleFileUpload completed');
    }
};

const uploadFile = async (file) => {
    console.log('Starting upload for file:', file.name);
    console.log('File size:', formatFileSize(file.size));
    console.log('File type:', file.type);
    console.log('Current user:', currentUser?.uid);

    if (!currentUser) {
        console.error('No current user for upload');
        showToast('Please login to upload files', 'error');
        return;
    }

    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storagePath = `files/${currentUser.uid}/${fileId}_${file.name}`;
    console.log('Storage path:', storagePath);

    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadProgress.classList.add('active');

    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${Math.round(progress)}%`;
                console.log(`Upload progress: ${Math.round(progress)}%`);
            },
            (error) => {
                console.error('Upload error details:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);

                let errorMessage = `Upload failed: ${file.name}`;

                // Provide more specific error messages
                if (error.code === 'storage/unauthorized') {
                    errorMessage = `Upload failed: ${file.name} - Permission denied. Please check Firebase storage rules.`;
                } else if (error.code === 'storage/canceled') {
                    errorMessage = `Upload canceled: ${file.name}`;
                } else if (error.code === 'storage/unknown') {
                    errorMessage = `Upload failed: ${file.name} - Unknown error occurred.`;
                } else if (error.code === 'storage/invalid-format') {
                    errorMessage = `Upload failed: ${file.name} - Invalid file format.`;
                } else if (error.code === 'storage/object-not-found') {
                    errorMessage = `Upload failed: ${file.name} - Storage location not found.`;
                } else if (error.code === 'storage/bucket-not-found') {
                    errorMessage = `Upload failed: ${file.name} - Storage bucket not found.`;
                } else if (error.code === 'storage/project-not-found') {
                    errorMessage = `Upload failed: ${file.name} - Firebase project not found.`;
                } else if (error.code === 'storage/quota-exceeded') {
                    errorMessage = `Upload failed: ${file.name} - Storage quota exceeded.`;
                } else if (error.code === 'storage/unauthenticated') {
                    errorMessage = `Upload failed: ${file.name} - User not authenticated.`;
                } else if (error.code === 'storage/retry-limit-exceeded') {
                    errorMessage = `Upload failed: ${file.name} - Too many retry attempts.`;
                } else if (error.message) {
                    errorMessage = `Upload failed: ${file.name} - ${error.message}`;
                }

                showToast(errorMessage, 'error');
                uploadProgress.classList.remove('active');
                progressFill.style.width = '0%';
                progressText.textContent = '0%';
                reject(error);
            },
            async () => {
                try {
                    console.log('Upload completed, getting download URL...');
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log('Download URL obtained:', downloadURL.substring(0, 50) + '...');

                    console.log('Saving file metadata to Firestore...');
                    // Save file metadata to Firestore
                    const fileDoc = await addDoc(collection(db, 'files'), {
                        id: fileId,
                        name: file.name,
                        size: file.size,
                        type: getFileType(file.name),
                        url: downloadURL,
                        storagePath: uploadTask.snapshot.ref.fullPath,
                        uploadDate: new Date().toISOString(),
                        userId: currentUser.uid
                    });
                    console.log('File metadata saved with ID:', fileDoc.id);

                    // Update user statistics
                    if (userData) {
                        console.log('Updating user statistics...');
                        const newTotalFiles = (userData.totalFiles || 0) + 1;
                        const newTotalStorage = (userData.totalStorage || 0) + file.size;
                        await updateUserData({
                            totalFiles: newTotalFiles,
                            totalStorage: newTotalStorage
                        });
                        console.log('User statistics updated');
                    }

                    showToast(`File uploaded successfully: ${file.name}`, 'success');
                    uploadProgress.classList.remove('active');
                    progressFill.style.width = '0%';
                    progressText.textContent = '0%';

                    // Refresh files list
                    console.log('Refreshing files list...');
                    await loadFiles();
                    console.log('Upload process completed successfully');
                    resolve();
                } catch (metadataError) {
                    console.error('Error saving file metadata:', metadataError);
                    console.error('Metadata error code:', metadataError.code);
                    console.error('Metadata error message:', metadataError.message);

                    // File was uploaded to storage but metadata save failed
                    showToast(`File uploaded but metadata save failed: ${file.name}`, 'warning');
                    uploadProgress.classList.remove('active');
                    progressFill.style.width = '0%';
                    progressText.textContent = '0%';

                    // Still resolve since the file was uploaded
                    resolve();
                }
            }
        );
    });
};

// File management functions
const loadFiles = async () => {
    if (!currentUser) {
        console.log('No current user, cannot load files');
        return;
    }

    console.log('Loading files for user:', currentUser.uid);

    try {
        // Try with orderBy first, fallback to simple query if index doesn't exist
        let querySnapshot;

        try {
            console.log('Attempting ordered query...');
            const q = query(
                collection(db, 'files'),
                where('userId', '==', currentUser.uid),
                orderBy('uploadDate', 'desc')
            );
            querySnapshot = await getDocs(q);
            console.log('Ordered query successful');
        } catch (indexError) {
            console.warn('Ordered query failed, trying simple query:', indexError);
            // Fallback to simple query without orderBy
            const q = query(
                collection(db, 'files'),
                where('userId', '==', currentUser.uid)
            );
            querySnapshot = await getDocs(q);
            console.log('Simple query successful');
        }

        files = [];
        console.log('Query returned', querySnapshot.size, 'documents');

        querySnapshot.forEach((doc) => {
            const fileData = { ...doc.data(), docId: doc.id };
            console.log('File found:', fileData.name);
            files.push(fileData);
        });

        // Sort files by upload date in JavaScript if we couldn't do it in the query
        files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

        console.log('Total files loaded:', files.length);
        renderFiles();

    } catch (error) {
        console.error('Error loading files - full details:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        showToast('Error loading files: ' + error.message, 'error');

        // Still try to render with empty files array
        files = [];
        renderFiles();
    }
};

const renderFiles = () => {
    console.log('Rendering files, total count:', files.length);
    console.log('Current filter:', currentFilter);
    console.log('Search query:', searchQuery);

    let filteredFiles = files;

    // Apply filter
    if (currentFilter !== 'all') {
        filteredFiles = files.filter(file => file.type === currentFilter);
        console.log('After filter, count:', filteredFiles.length);
    }

    // Apply search
    if (searchQuery) {
        filteredFiles = filteredFiles.filter(file =>
            file.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        console.log('After search, count:', filteredFiles.length);
    }

    console.log('Final filtered files count:', filteredFiles.length);

    if (filteredFiles.length === 0) {
        console.log('No files to display, showing empty state');
        emptyState.classList.remove('hidden');
        filesContainer.innerHTML = '';

        // If we have files but they're all filtered out, show a different message
        if (files.length > 0) {
            console.log('Files exist but are filtered out');
        } else {
            console.log('No files exist for this user');
        }
        return;
    }

    console.log('Rendering', filteredFiles.length, 'files');
    emptyState.classList.add('hidden');
    filesContainer.innerHTML = '';

    filteredFiles.forEach((file, index) => {
        console.log(`Rendering file ${index + 1}:`, file.name);
        try {
            const fileCard = createFileCard(file);
            filesContainer.appendChild(fileCard);
        } catch (cardError) {
            console.error('Error creating card for file:', file.name, cardError);
        }
    });

    console.log('File rendering complete');
};

const createFileCard = (file) => {
    const card = document.createElement('div');
    card.className = 'file-card';

    const isImage = file.type === 'images';
    const fileIcon = getFileIcon(file.type);

    card.innerHTML = `
        <div class="file-preview">
            ${isImage ?
            `<img src="${file.url}" alt="${file.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="file-icon" style="display: none;"><i class="${fileIcon}"></i></div>` :
            `<div class="file-icon"><i class="${fileIcon}"></i></div>`
        }
            <div class="file-type-badge">${file.type}</div>
        </div>
        <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
                <span>${formatFileSize(file.size)}</span>
                <span>•</span>
                <span>${formatDate(file.uploadDate)}</span>
            </div>
        </div>
        <div class="file-actions">
            <button class="file-action-btn secondary" onclick="viewFile('${file.url}', '${file.name}', '${file.type}')" title="View">
                <i class="fas fa-eye"></i>
            </button>
            <button class="file-action-btn primary" onclick="downloadFile('${file.url}', '${file.name}')" title="Download">
                <i class="fas fa-download"></i>
            </button>
            <button class="file-action-btn danger" onclick="showDeleteModal('${file.docId}', '${file.name}')" title="Delete">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    return card;
};

const downloadFile = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Opening ${filename} for download`, 'success');
};

const showDeleteModal = (docId, filename) => {
    deleteFileName.textContent = filename;
    deleteModal.classList.remove('hidden');
    deleteModal.style.display = 'flex';

    // Store file info for deletion
    deleteModal.dataset.docId = docId;
    deleteModal.dataset.filename = filename;
};

const hideDeleteModal = () => {
    deleteModal.classList.add('hidden');
    deleteModal.style.display = 'none';
};

const deleteFile = async () => {
    const docId = deleteModal.dataset.docId;
    const filename = deleteModal.dataset.filename;

    if (!docId) return;

    try {
        const button = confirmDelete;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

        // Find the file in our files array
        const file = files.find(f => f.docId === docId);

        if (file) {
            // Delete from Firebase Storage
            const storageRef = ref(storage, file.storagePath);
            await deleteObject(storageRef);
        }

        // Delete from Firestore
        await deleteDoc(doc(db, 'files', docId));

        // Update user statistics
        if (userData && file) {
            const newTotalFiles = Math.max((userData.totalFiles || 0) - 1, 0);
            const newTotalStorage = Math.max((userData.totalStorage || 0) - file.size, 0);
            await updateUserData({
                totalFiles: newTotalFiles,
                totalStorage: newTotalStorage
            });
        }

        showToast(`File deleted: ${filename}`, 'success');
        hideDeleteModal();

        // Refresh files list
        await loadFiles();

    } catch (error) {
        console.error('Error deleting file:', error);
        showToast('Error deleting file', 'error');
    } finally {
        const button = confirmDelete;
        button.disabled = false;
        button.innerHTML = 'Delete';
    }
};

// File Viewer Functions
const viewFile = (url, filename, fileType) => {
    const fileViewerModal = document.getElementById('file-viewer-modal');
    const fileViewerContainer = document.getElementById('file-viewer-container');
    const viewerFileName = document.getElementById('viewer-file-name');
    const downloadBtn = document.getElementById('download-viewed-file');

    // Set the file name in modal title
    viewerFileName.textContent = filename;

    // Store download info
    downloadBtn.onclick = () => downloadFile(url, filename);

    // Show loading state
    fileViewerContainer.innerHTML = `
        <div class="file-viewer-loading">
            <div class="loading-spinner">
                <i class="fas fa-spinner"></i>
            </div>
            <p>Loading ${filename}...</p>
        </div>
    `;

    // Show modal
    fileViewerModal.classList.remove('hidden');
    fileViewerModal.style.display = 'flex';

    // Load content based on file type
    setTimeout(() => {
        loadFileContent(url, filename, fileType, fileViewerContainer);
    }, 100);
};

const loadFileContent = (url, filename, fileType, container) => {
    console.log('Loading file content:', { filename, fileType, url: url.substring(0, 50) + '...' });

    try {
        // Check for PDF specifically by file extension
        const isPDF = filename.toLowerCase().endsWith('.pdf');
        console.log('Is PDF file:', isPDF);

        if (isPDF) {
            console.log('Loading PDF viewer for:', filename);
            loadPDFViewer(url, filename, container);
            return;
        }

        switch (fileType) {
            case 'images':
                console.log('Loading image viewer');
                loadImageViewer(url, filename, container);
                break;
            case 'videos':
                console.log('Loading video viewer');
                loadVideoViewer(url, filename, container);
                break;
            case 'documents':
                console.log('Loading document viewer');
                loadDocumentViewer(url, filename, container);
                break;
            case 'audio':
                console.log('Loading audio viewer');
                loadAudioViewer(url, filename, container);
                break;
            case 'code':
                console.log('Loading code viewer');
                loadCodeViewer(url, filename, container);
                break;
            default:
                console.log('Loading default viewer for type:', fileType);
                loadDefaultViewer(url, filename, fileType, container);
        }
    } catch (error) {
        console.error('Error loading file content:', error);
        showFileViewerError(container, `Failed to load ${filename}: ${error.message}`);
    }
};

const loadImageViewer = (url, filename, container) => {
    container.innerHTML = `
        <img src="${url}" alt="${filename}" 
             onload="console.log('Image loaded successfully')"
             onerror="showFileViewerError(document.getElementById('file-viewer-container'), 'Failed to load image')">
    `;
};

const loadVideoViewer = (url, filename, container) => {
    const videoExtension = filename.split('.').pop().toLowerCase();
    let mimeType = 'video/mp4'; // default

    // Set appropriate MIME type
    switch (videoExtension) {
        case 'webm': mimeType = 'video/webm'; break;
        case 'mov': mimeType = 'video/quicktime'; break;
        case 'avi': mimeType = 'video/x-msvideo'; break;
        case 'mkv': mimeType = 'video/x-matroska'; break;
        case 'mp4':
        default: mimeType = 'video/mp4'; break;
    }

    container.innerHTML = `
        <div class="video-viewer-wrapper">
            <video 
                controls 
                controlsList="nodownload"
                preload="metadata" 
                style="
                    width: 100%; 
                    height: auto; 
                    max-width: 100%; 
                    max-height: 100%;
                    background: #000;
                    border-radius: 8px;
                "
                onloadedmetadata="this.style.display='block'"
                onerror="this.nextElementSibling.style.display='block'; this.style.display='none';"
            >
                <source src="${url}" type="${mimeType}">
                Your browser does not support the video tag.
            </video>
            <div class="video-error" style="display: none; text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 16px; color: var(--warning);"></i>
                <p>Video format not supported by your browser.</p>
                <button onclick="downloadFile('${url}', '${filename}')" class="pdf-control-btn" style="margin-top: 16px;">
                    <i class="fas fa-download"></i> Download Video
                </button>
            </div>
            <div class="video-controls-info" style="margin-top: 10px; text-align: center; color: var(--text-muted); font-size: 0.875rem;">
                <p>Use video controls to play, pause, adjust volume, and seek through the video</p>
            </div>
        </div>
    `;

    // Get the video element and ensure controls are properly initialized
    const videoElement = container.querySelector('video');
    if (videoElement) {
        // Force controls to be visible
        videoElement.controls = true;

        // Add additional event listeners for better UX
        videoElement.addEventListener('loadstart', () => {
            console.log('Video loading started');
        });

        videoElement.addEventListener('canplay', () => {
            console.log('Video can start playing');
        });

        videoElement.addEventListener('error', (e) => {
            console.error('Video loading error:', e);
        });
    }
};

const loadPDFViewer = (url, filename, container) => {
    console.log('Loading PDF:', filename, 'from URL:', url);

    // Show loading state
    container.innerHTML = `
        <div class="file-viewer-loading">
            <div class="loading-spinner">
                <i class="fas fa-spinner"></i>
            </div>
            <p>Loading PDF: ${filename}...</p>
        </div>
    `;

    // Try multiple PDF viewing methods
    setTimeout(() => {
        tryPDFViewing(url, filename, container);
    }, 500);
};

const tryPDFViewing = (url, filename, container) => {
    // Method 1: Try direct iframe embedding
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = filename;
    iframe.style.cssText = `
        width: 100%;
        height: 70vh;
        border: none;
        border-radius: var(--border-radius-md);
        box-shadow: var(--shadow-md);
    `;

    // Set up error handling
    let loadTimeout;
    let hasLoaded = false;

    const onLoad = () => {
        console.log('PDF iframe loaded successfully');
        hasLoaded = true;
        clearTimeout(loadTimeout);
    };

    const onError = () => {
        console.log('PDF iframe failed, trying alternative methods');
        if (!hasLoaded) {
            tryAlternativePDFViewing(url, filename, container);
        }
    };

    iframe.onload = onLoad;
    iframe.onerror = onError;

    // Set timeout to try alternative if iframe doesn't load within 5 seconds
    loadTimeout = setTimeout(() => {
        if (!hasLoaded) {
            console.log('PDF iframe timeout, trying alternatives');
            tryAlternativePDFViewing(url, filename, container);
        }
    }, 5000);

    // Clear container and add iframe
    container.innerHTML = '';
    container.appendChild(iframe);
};

const tryAlternativePDFViewing = (url, filename, container) => {
    console.log('Trying alternative PDF viewing methods');

    // Method 2: Try using PDF.js or browser's built-in PDF viewer
    const alternativeUrl = url + '#toolbar=1&navpanes=1&scrollbar=1';

    container.innerHTML = `
        <div class="pdf-viewer-container">
            <div class="pdf-viewer-header">
                <h4>📄 ${filename}</h4>
                <div class="pdf-viewer-controls">
                    <button onclick="window.open('${url}', '_blank')" class="pdf-control-btn">
                        <i class="fas fa-external-link-alt"></i> Open in New Tab
                    </button>
                    <button onclick="downloadFile('${url}', '${filename}')" class="pdf-control-btn">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            </div>
            
            <div class="pdf-viewer-methods">
                <div class="pdf-method">
                    <h5>Method 1: Direct Embed</h5>
                    <iframe src="${alternativeUrl}" 
                            style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 4px;">
                        <p>PDF cannot be displayed inline.</p>
                    </iframe>
                </div>
                
                <div class="pdf-method" style="margin-top: 20px;">
                    <h5>Method 2: Object Embed</h5>
                    <object data="${url}" type="application/pdf" 
                            style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 4px;">
                        <p>PDF cannot be displayed. Browser may not support PDF viewing.</p>
                        <a href="${url}" target="_blank" style="color: var(--primary-color);">
                            Click here to open PDF in new tab
                        </a>
                    </object>
                </div>
                
                <div class="pdf-method" style="margin-top: 20px;">
                    <h5>Method 3: Embed Tag</h5>
                    <embed src="${url}" type="application/pdf" 
                           style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
            </div>
            
            <div class="pdf-fallback" style="margin-top: 20px; text-align: center; padding: 20px; background: var(--tertiary-bg); border-radius: 8px;">
                <p><strong>Having trouble viewing the PDF?</strong></p>
                <p>Some browsers may block PDF display due to security settings.</p>
                <div style="margin-top: 15px;">
                    <button onclick="window.open('${url}', '_blank')" 
                            style="margin: 5px; padding: 10px 20px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-external-link-alt"></i> Open in New Tab
                    </button>
                    <button onclick="downloadFile('${url}', '${filename}')" 
                            style="margin: 5px; padding: 10px 20px; background: var(--secondary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-download"></i> Download PDF
                    </button>
                </div>
            </div>
        </div>
    `;
};

const loadAudioViewer = (url, filename, container) => {
    const audioExtension = filename.split('.').pop().toLowerCase();
    let mimeType = 'audio/mpeg'; // default

    switch (audioExtension) {
        case 'mp3': mimeType = 'audio/mpeg'; break;
        case 'wav': mimeType = 'audio/wav'; break;
        case 'ogg': mimeType = 'audio/ogg'; break;
        case 'm4a': mimeType = 'audio/mp4'; break;
        case 'flac': mimeType = 'audio/flac'; break;
        default: mimeType = 'audio/mpeg'; break;
    }

    container.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <div class="file-info-display">
                <div class="file-icon">
                    <i class="fas fa-music"></i>
                </div>
                <div class="file-details">${filename}</div>
            </div>
            <audio controls style="width: 100%; max-width: 500px; margin-top: 20px;">
                <source src="${url}" type="${mimeType}">
                Your browser does not support the audio element.
            </audio>
        </div>
    `;
};

const loadCodeViewer = async (url, filename, container) => {
    try {
        const response = await fetch(url);
        const text = await response.text();

        container.innerHTML = `
            <div class="file-content-display">
                <div style="margin-bottom: 10px; font-weight: bold; color: var(--primary-color);">
                    📄 ${filename}
                </div>
                ${escapeHtml(text)}
            </div>
        `;
    } catch (error) {
        console.error('Error loading code file:', error);
        showFileViewerError(container, `Failed to load code file: ${filename}`);
    }
};

const loadDocumentViewer = async (url, filename, container) => {
    try {
        const response = await fetch(url);
        const text = await response.text();

        container.innerHTML = `
            <div class="file-content-display">
                <div style="margin-bottom: 10px; font-weight: bold; color: var(--primary-color);">
                    📄 ${filename}
                </div>
                ${escapeHtml(text)}
            </div>
        `;
    } catch (error) {
        console.error('Error loading document:', error);
        showFileViewerError(container, `Failed to load document: ${filename}`);
    }
};

const loadDefaultViewer = (url, filename, fileType, container) => {
    const fileIcon = getFileIcon(fileType);
    const fileSize = files.find(f => f.name === filename)?.size || 0;

    container.innerHTML = `
        <div class="file-info-display">
            <div class="file-icon">
                <i class="${fileIcon}"></i>
            </div>
            <div class="file-details">${filename}</div>
            <div class="file-meta">
                <p>Type: ${fileType}</p>
                <p>Size: ${formatFileSize(fileSize)}</p>
                <p style="margin-top: 15px;">
                    This file type cannot be previewed in the browser.
                </p>
                <button onclick="downloadFile('${url}', '${filename}')" 
                        style="margin-top: 10px; padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-download"></i> Download to View
                </button>
            </div>
        </div>
    `;
};

const showFileViewerError = (container, message) => {
    container.innerHTML = `
        <div class="file-viewer-error">
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Unable to Load File</h3>
            <p>${message}</p>
            <p>Try downloading the file to view it.</p>
        </div>
    `;
};

const hideFileViewerModal = () => {
    const fileViewerModal = document.getElementById('file-viewer-modal');
    fileViewerModal.classList.add('hidden');
    fileViewerModal.style.display = 'none';

    // Clear content to free memory
    const container = document.getElementById('file-viewer-container');
    container.innerHTML = '';
};

// Utility function to escape HTML
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// User data management functions
const saveUserData = async (user, name, username = null, password = null) => {
    try {
        const userData = {
            uid: user.uid,
            name: name,
            username: username || name.toLowerCase().replace(/\s+/g, ''),
            email: user.email,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            totalFiles: 0,
            totalStorage: 0
        };

        // Save to Firestore (without password for security)
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, userData);
        console.log('User data saved to Firestore successfully');

        // Also save to Realtime Database as backup (including password as requested)
        try {
            const realtimeUserData = {
                ...userData,
                // ⚠️ SECURITY WARNING: Storing plain password is not recommended
                password: password || null
            };
            const realtimeUserRef = dbRef(realtimeDb, `users/${user.uid}`);
            await dbSet(realtimeUserRef, realtimeUserData);
            console.log('User data also saved to Realtime Database as backup (with password)');
        } catch (realtimeError) {
            console.warn('Failed to save to Realtime Database (backup), but Firestore succeeded:', realtimeError);
            // Don't throw error here since Firestore save succeeded
        }

        return userData;
    } catch (error) {
        console.error('Error saving user data:', error);
        throw error;
    }
};

const loadUserData = async (user) => {
    try {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            return userDoc.data();
        } else {
            // Create user data if it doesn't exist
            const name = user.displayName || 'User';
            return await saveUserData(user, name);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        return null;
    }
};

const updateUserData = async (updates) => {
    if (!currentUser) return;

    try {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, {
            ...userData,
            ...updates,
            lastLogin: new Date().toISOString()
        });

        userData = { ...userData, ...updates };
    } catch (error) {
        console.error('Error updating user data:', error);
    }
};

const showWelcomeMessage = (name) => {
    const welcomeToast = document.createElement('div');
    welcomeToast.className = 'toast success welcome-toast';
    welcomeToast.style.minWidth = '350px';
    welcomeToast.style.background = 'linear-gradient(135deg, #00bcd4, #0097a7)';
    welcomeToast.style.color = 'white';
    welcomeToast.style.animation = 'slideIn 0.5s ease-out, fadeOut 0.5s ease-in 4.5s';

    const currentTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    welcomeToast.innerHTML = `
        <i class="toast-icon fas fa-user-circle"></i>
        <div class="toast-message">
            <strong>Welcome, ${name}!</strong><br>
            <small>Logged in at ${currentTime}</small>
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    toastContainer.appendChild(welcomeToast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (welcomeToast.parentNode) {
            welcomeToast.remove();
        }
    }, 5000);

    // Manual close
    welcomeToast.querySelector('.toast-close').addEventListener('click', () => {
        welcomeToast.remove();
    });
};

// View and filter functions
const setView = (view) => {
    currentView = view;

    galleryViewBtn.classList.toggle('active', view === 'gallery');
    listViewBtn.classList.toggle('active', view === 'list');

    filesContainer.className = `files-container ${view}-view`;

    renderFiles();
};

const setFilter = (filter) => {
    currentFilter = filter;
    renderFiles();
};

const setSearch = (query) => {
    searchQuery = query;
    renderFiles();
};

// Drag and drop functionality
const handleDragOver = (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
};

const handleDragLeave = (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
};

const handleDrop = (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
};

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, setting up event listeners');

    try {
        // Authentication event listeners
        console.log('Setting up authentication event listeners');

        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        console.log('Forms found:', { loginForm: !!loginForm, registerForm: !!registerForm });

        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
            console.log('Login form event listener attached');
        } else {
            console.error('Login form not found');
        }

        if (registerForm) {
            registerForm.addEventListener('submit', handleRegister);
            console.log('Register form event listener attached');
        } else {
            console.error('Register form not found');
        }

        // Initial auth switch link event listener
        console.log('Looking for auth switch link...');
        const authSwitchLink = document.getElementById('auth-switch-link');
        if (authSwitchLink) {
            console.log('Auth switch link found, attaching event listener');
            authSwitchLink.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Initial auth switch link clicked');
                toggleAuthMode();
            });
            console.log('Auth switch link event listener attached');
        } else {
            console.error('Auth switch link not found during setup');
            // Try to find it after a short delay
            setTimeout(() => {
                const delayedAuthSwitchLink = document.getElementById('auth-switch-link');
                if (delayedAuthSwitchLink) {
                    console.log('Found auth switch link on retry');
                    delayedAuthSwitchLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        console.log('Delayed auth switch link clicked');
                        toggleAuthMode();
                    });
                }
            }, 500);
        }

        logoutBtn.addEventListener('click', handleLogout);

        // File upload event listeners
        console.log('Setting up file upload event listeners');
        console.log('Upload area element:', uploadArea);
        console.log('File input element:', fileInput);

        if (uploadArea && fileInput) {
            console.log('Adding upload area click listener');
            uploadArea.addEventListener('click', (e) => {
                // Only prevent default if clicking on the upload area itself, not child elements
                if (e.target === uploadArea || uploadArea.contains(e.target)) {
                    console.log('Upload area clicked, triggering file input');
                    fileInput.click();
                }
            });
            uploadArea.addEventListener('dragover', handleDragOver);
            uploadArea.addEventListener('dragleave', handleDragLeave);
            uploadArea.addEventListener('drop', handleDrop);

            fileInput.addEventListener('change', (e) => {
                console.log('File input changed, files selected:', e.target.files.length);
                if (e.target.files.length > 0) {
                    handleFileUpload(Array.from(e.target.files));
                    // Clear the input to allow selecting the same file again if needed
                    e.target.value = '';
                }
            });
            console.log('Upload event listeners attached successfully');
        } else {
            console.error('Upload area or file input not found!');
            console.error('Upload area:', uploadArea);
            console.error('File input:', fileInput);
        }

        // View and filter event listeners
        galleryViewBtn.addEventListener('click', () => setView('gallery'));
        listViewBtn.addEventListener('click', () => setView('list'));
        fileFilter.addEventListener('change', (e) => setFilter(e.target.value));
        searchInput.addEventListener('input', (e) => setSearch(e.target.value));

        // Refresh button event listener
        const refreshFilesBtn = document.getElementById('refresh-files-btn');
        if (refreshFilesBtn) {
            refreshFilesBtn.addEventListener('click', async () => {
                refreshFilesBtn.disabled = true;
                refreshFilesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';

                try {
                    await loadFiles();
                    showToast('Files refreshed successfully', 'success');
                } catch (error) {
                    console.error('Manual refresh failed:', error);
                    showToast('Failed to refresh files: ' + error.message, 'error');
                } finally {
                    refreshFilesBtn.disabled = false;
                    refreshFilesBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                }
            });
        }

        // Modal event listeners
        deleteModalClose.addEventListener('click', hideDeleteModal);
        cancelDelete.addEventListener('click', hideDeleteModal);
        confirmDelete.addEventListener('click', deleteFile);

        // Close modal when clicking outside
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                hideDeleteModal();
            }
        });

        // File Viewer Modal event listeners
        const fileViewerModal = document.getElementById('file-viewer-modal');
        const fileViewerClose = document.getElementById('file-viewer-close');
        const closeFileViewerBtn = document.getElementById('close-file-viewer');

        if (fileViewerClose) {
            fileViewerClose.addEventListener('click', hideFileViewerModal);
        }

        if (closeFileViewerBtn) {
            closeFileViewerBtn.addEventListener('click', hideFileViewerModal);
        }

        // Close file viewer modal when clicking outside
        if (fileViewerModal) {
            fileViewerModal.addEventListener('click', (e) => {
                if (e.target === fileViewerModal) {
                    hideFileViewerModal();
                }
            });
        }

        // Make functions globally available
        window.downloadFile = downloadFile;
        window.showDeleteModal = showDeleteModal;
        window.viewFile = viewFile;

        // Debug functions for testing
        window.testFirebaseConnection = async () => {
            console.log('=== FIREBASE CONNECTION TEST ===');
            console.log('Firebase Config:', firebaseConfig);
            console.log('Auth object:', auth);
            console.log('DB object:', db);
            console.log('Storage object:', storage);

            try {
                // Test Firestore
                console.log('Testing Firestore connection...');
                const testRef = collection(db, 'test');
                console.log('✅ Firestore connection successful');

                // Test Auth
                console.log('Testing Auth service...');
                console.log('Current user:', auth.currentUser);
                console.log('✅ Auth service accessible');

                alert('Firebase connection test passed! Check console for details.');
                return true;
            } catch (error) {
                console.error('❌ Firebase connection test failed:', error);
                alert('Firebase connection test failed: ' + error.message);
                return false;
            }
        };

        // Force reload files for debugging
        window.forceRefreshFiles = async () => {
            console.log('=== FORCE REFRESH FILES ===');
            console.log('Current user:', currentUser?.uid);
            console.log('Current files count:', files.length);

            if (!currentUser) {
                console.log('❌ No user logged in');
                alert('Please login first');
                return;
            }

            try {
                await loadFiles();
                console.log('✅ Files refreshed successfully');
                console.log('New files count:', files.length);
                alert(`Files refreshed! Found ${files.length} files. Check console for details.`);
            } catch (error) {
                console.error('❌ Force refresh failed:', error);
                alert('Force refresh failed: ' + error.message);
            }
        };

        // Debug function to check Firestore directly
        window.debugFirestoreFiles = async () => {
            console.log('=== FIRESTORE DEBUG ===');

            if (!currentUser) {
                console.log('❌ No user logged in');
                alert('Please login first');
                return;
            }

            try {
                console.log('Checking Firestore files collection directly...');
                console.log('User ID:', currentUser.uid);

                // Get ALL files in the collection (for debugging)
                const allFilesSnapshot = await getDocs(collection(db, 'files'));
                console.log('Total files in collection:', allFilesSnapshot.size);

                let userFiles = [];
                allFilesSnapshot.forEach((doc) => {
                    const data = doc.data();
                    console.log('File in collection:', {
                        id: doc.id,
                        name: data.name,
                        userId: data.userId,
                        isMyFile: data.userId === currentUser.uid
                    });

                    if (data.userId === currentUser.uid) {
                        userFiles.push({ ...data, docId: doc.id });
                    }
                });

                console.log('Files belonging to current user:', userFiles.length);
                userFiles.forEach((file, index) => {
                    console.log(`User file ${index + 1}:`, {
                        name: file.name,
                        type: file.type,
                        uploadDate: file.uploadDate,
                        size: file.size
                    });
                });

                alert(`Firestore debug complete! Found ${userFiles.length} files for current user. Check console for details.`);

            } catch (error) {
                console.error('❌ Firestore debug failed:', error);
                alert('Firestore debug failed: ' + error.message);
            }
        };

        // Add refresh button to debug panel
        window.addRefreshButton = () => {
            const debugPanel = document.querySelector('.debug-panel');
            if (debugPanel && !document.getElementById('refresh-files-btn')) {
                const refreshBtn = document.createElement('button');
                refreshBtn.id = 'refresh-files-btn';
                refreshBtn.className = 'debug-btn';
                refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Files';
                refreshBtn.onclick = window.forceRefreshFiles;
                debugPanel.appendChild(refreshBtn);

                const debugBtn = document.createElement('button');
                debugBtn.id = 'debug-firestore-btn';
                debugBtn.className = 'debug-btn';
                debugBtn.innerHTML = '<i class="fas fa-search"></i> Debug Firestore';
                debugBtn.onclick = window.debugFirestoreFiles;
                debugPanel.appendChild(debugBtn);
            }
        };

        // Call this when page loads
        setTimeout(() => {
            window.addRefreshButton();
        }, 2000);

        // Debug functions for upload flow and file loading issues
        window.debugUploadFlow = async () => {
            console.log('=== UPLOAD FLOW DEBUG ===');

            if (!currentUser) {
                console.log('❌ No user logged in');
                alert('Please login first');
                return;
            }

            console.log('Current user:', currentUser.uid);
            console.log('Current files count before:', files.length);

            // Test file type detection
            console.log('\n--- File Type Detection Test ---');
            const testFiles = ['test.webm', 'Button.webm', 'video.mp4', 'image.jpg'];
            testFiles.forEach(filename => {
                const type = getFileType(filename);
                console.log(`${filename} -> ${type}`);
            });

            // Check current filter and search settings
            console.log('\n--- UI State ---');
            console.log('Current filter:', currentFilter);
            console.log('Search query:', searchQuery);
            console.log('Current view:', currentView);

            // Check DOM elements
            console.log('\n--- DOM Elements ---');
            console.log('Files container exists:', !!filesContainer);
            console.log('Empty state exists:', !!emptyState);
            console.log('Files container content:', filesContainer?.innerHTML?.length || 0, 'characters');
            console.log('Empty state visible:', !emptyState?.classList.contains('hidden'));

            // Force a file load and render
            console.log('\n--- Force Reload ---');
            try {
                await loadFiles();
                console.log('Files after reload:', files.length);
            } catch (error) {
                console.error('Reload failed:', error);
            }

            console.log('=== DEBUG COMPLETE ===');
            alert('Upload flow debug complete! Check console for detailed information.');
        };

        // Test PDF viewing functionality
        window.testPDFViewer = () => {
            console.log('=== PDF VIEWER TEST ===');

            // Test with a sample PDF URL (you can replace with your actual PDF URL)
            const testPDFUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
            const testFilename = 'test-document.pdf';

            console.log('Testing PDF viewer with sample PDF...');

            try {
                // Open the file viewer modal
                const fileViewerModal = document.getElementById('file-viewer-modal');
                const fileViewerContainer = document.getElementById('file-viewer-container');
                const viewerFileName = document.getElementById('viewer-file-name');

                viewerFileName.textContent = testFilename;
                fileViewerModal.classList.remove('hidden');
                fileViewerModal.style.display = 'flex';

                // Test the PDF loading
                loadPDFViewer(testPDFUrl, testFilename, fileViewerContainer);

                console.log('✅ PDF viewer test initiated');
                alert('PDF viewer test started! Check the modal that opened. If it doesn\'t work, try with your actual PDF file.');

            } catch (error) {
                console.error('❌ PDF viewer test failed:', error);
                alert('PDF viewer test failed: ' + error.message);
            }
        };

        // Test PDF with user's actual file
        window.testUserPDF = () => {
            console.log('=== USER PDF TEST ===');

            if (!currentUser) {
                alert('Please login first');
                return;
            }

            // Find PDF files in user's collection
            const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));

            if (pdfFiles.length === 0) {
                alert('No PDF files found in your collection. Upload a PDF file first.');
                console.log('No PDF files found');
                return;
            }

            console.log('Found PDF files:', pdfFiles.map(f => f.name));

            // Test with the first PDF file
            const testFile = pdfFiles[0];
            console.log('Testing with PDF:', testFile.name);
            console.log('PDF URL:', testFile.url.substring(0, 50) + '...');

            try {
                viewFile(testFile.url, testFile.name, testFile.type);
                console.log('✅ User PDF test initiated');
                alert(`Testing PDF viewer with your file: ${testFile.name}`);

            } catch (error) {
                console.error('❌ User PDF test failed:', error);
                alert('User PDF test failed: ' + error.message);
            }
        };

        // Check browser PDF support
        window.checkPDFSupport = () => {
            console.log('=== BROWSER PDF SUPPORT CHECK ===');

            const results = {
                navigatorPlugins: !!navigator.plugins,
                hasAdobePlugin: false,
                hasChromePlugin: false,
                supportsEmbed: !!document.createElement('embed'),
                supportsObject: !!document.createElement('object'),
                supportsIframe: !!document.createElement('iframe'),
                userAgent: navigator.userAgent
            };

            // Check for PDF plugins
            if (navigator.plugins) {
                for (let i = 0; i < navigator.plugins.length; i++) {
                    const plugin = navigator.plugins[i];
                    if (plugin.name.toLowerCase().includes('adobe') && plugin.name.toLowerCase().includes('pdf')) {
                        results.hasAdobePlugin = true;
                    }
                    if (plugin.name.toLowerCase().includes('chrome pdf')) {
                        results.hasChromePlugin = true;
                    }
                }
            }

            console.log('Browser PDF Support Results:', results);

            let message = 'Browser PDF Support Check:\n\n';
            message += `✅ Embed Support: ${results.supportsEmbed}\n`;
            message += `✅ Object Support: ${results.supportsObject}\n`;
            message += `✅ Iframe Support: ${results.supportsIframe}\n`;
            message += `📄 Adobe PDF Plugin: ${results.hasAdobePlugin}\n`;
            message += `🌐 Chrome PDF Plugin: ${results.hasChromePlugin}\n`;
            message += `\nBrowser: ${results.userAgent.split(' ')[0]}\n`;
            message += `\nCheck console for detailed results.`;

            alert(message);
        };

        // Quick file count checker
        window.quickFileCheck = async () => {
            if (!currentUser) {
                alert('Please login first');
                return;
            }

            try {
                const q = query(collection(db, 'files'), where('userId', '==', currentUser.uid));
                const querySnapshot = await getDocs(q);

                alert(`Quick check: Found ${querySnapshot.size} files in Firestore for current user.\nCurrent app files array: ${files.length} files.`);

                console.log('=== QUICK FILE CHECK ===');
                console.log('Firestore files:', querySnapshot.size);
                console.log('App files array:', files.length);
                querySnapshot.forEach((doc) => {
                    console.log('Firestore file:', doc.data().name);
                });

            } catch (error) {
                console.error('Quick check failed:', error);
                alert('Quick check failed: ' + error.message);
            }
        };

        // Add these functions to debug panel
        window.addMoreDebugButtons = () => {
            const debugPanel = document.querySelector('.debug-panel');
            if (debugPanel && !document.getElementById('debug-upload-flow-btn')) {
                const debugFlowBtn = document.createElement('button');
                debugFlowBtn.id = 'debug-upload-flow-btn';
                debugFlowBtn.className = 'debug-btn';
                debugFlowBtn.innerHTML = '<i class="fas fa-bug"></i> Debug Upload Flow';
                debugFlowBtn.onclick = window.debugUploadFlow;
                debugPanel.appendChild(debugFlowBtn);

                const quickCheckBtn = document.createElement('button');
                quickCheckBtn.id = 'quick-check-btn';
                quickCheckBtn.className = 'debug-btn';
                quickCheckBtn.innerHTML = '<i class="fas fa-tachometer-alt"></i> Quick File Check';
                quickCheckBtn.onclick = window.quickFileCheck;
                debugPanel.appendChild(quickCheckBtn);

                // PDF Debug Buttons
                const testPDFBtn = document.createElement('button');
                testPDFBtn.id = 'test-pdf-btn';
                testPDFBtn.className = 'debug-btn';
                testPDFBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Test PDF Viewer';
                testPDFBtn.onclick = window.testPDFViewer;
                debugPanel.appendChild(testPDFBtn);

                const testUserPDFBtn = document.createElement('button');
                testUserPDFBtn.id = 'test-user-pdf-btn';
                testUserPDFBtn.className = 'debug-btn';
                testUserPDFBtn.innerHTML = '<i class="fas fa-user"></i> Test User PDF';
                testUserPDFBtn.onclick = window.testUserPDF;
                debugPanel.appendChild(testUserPDFBtn);

                const checkPDFSupportBtn = document.createElement('button');
                checkPDFSupportBtn.id = 'check-pdf-support-btn';
                checkPDFSupportBtn.className = 'debug-btn';
                checkPDFSupportBtn.innerHTML = '<i class="fas fa-check-circle"></i> Check PDF Support';
                checkPDFSupportBtn.onclick = window.checkPDFSupport;
                debugPanel.appendChild(checkPDFSupportBtn);
            }
        };

        // Call this when page loads
        setTimeout(() => {
            window.addMoreDebugButtons();
        }, 2500);

        // Enhanced Firebase connection test
        window.testFirebaseSetup = async () => {
            console.log('=== COMPREHENSIVE FIREBASE SETUP TEST ===');

            try {
                // Test basic Firebase services
                console.log('1. Testing Firebase initialization...');
                console.log('✅ Firebase app initialized:', !!app);
                console.log('✅ Auth service:', !!auth);
                console.log('✅ Firestore:', !!db);
                console.log('✅ Storage:', !!storage);

                // Test authentication configuration
                console.log('2. Testing authentication configuration...');
                try {
                    // Try to access auth settings (this will fail if auth is not configured)
                    const testEmail = 'test@test.com';
                    const testPassword = 'testpassword123';

                    // This should fail with configuration-not-found if auth is not enabled
                    await createUserWithEmailAndPassword(auth, testEmail, testPassword);
                    console.log('⚠️  Test user created (this should not happen in setup test)');

                    // Clean up test user
                    if (auth.currentUser) {
                        await auth.currentUser.delete();
                        console.log('✅ Test user cleaned up');
                    }

                } catch (error) {
                    if (error.code === 'auth/configuration-not-found') {
                        console.log('❌ Authentication not configured properly');
                        console.log('👉 Please enable Email/Password authentication in Firebase Console');
                        showFirebaseSetupGuide();
                        return false;
                    } else if (error.code === 'auth/email-already-in-use') {
                        console.log('✅ Authentication is properly configured (test email already exists)');
                    } else {
                        console.log('✅ Authentication configuration seems OK (got expected error)');
                    }
                }

                console.log('3. Testing Firestore access...');
                const testCollection = collection(db, 'test');
                console.log('✅ Firestore access successful');

                console.log('4. Testing Storage access...');
                const testStorageRef = ref(storage, 'test/test.txt');
                console.log('✅ Storage access successful');

                console.log('=== SETUP TEST COMPLETE ===');
                alert('Firebase setup test complete! Check console for results.');
                return true;

            } catch (error) {
                console.error('❌ Firebase setup test failed:', error);

                if (error.code === 'auth/configuration-not-found') {
                    showFirebaseSetupGuide();
                }

                alert('Firebase setup test failed: ' + error.message + '. Check console for details.');
                return false;
            }
        };

        // Test file upload functionality
        window.testFileUpload = async () => {
            console.log('=== FILE UPLOAD TEST ===');

            if (!currentUser) {
                console.log('❌ No user logged in');
                alert('Please login first before testing file upload');
                return false;
            }

            try {
                // Create a small test file
                const testContent = 'This is a test file for upload functionality';
                const testBlob = new Blob([testContent], { type: 'text/plain' });
                const testFile = new File([testBlob], 'test-upload.txt', { type: 'text/plain' });

                console.log('Testing upload with:', {
                    name: testFile.name,
                    size: testFile.size,
                    type: testFile.type
                });

                // Test storage access
                console.log('1. Testing storage access...');
                const testStorageRef = ref(storage, `test/${currentUser.uid}/test-file.txt`);
                console.log('✅ Storage reference created');

                // Test upload
                console.log('2. Testing file upload...');
                await uploadFile(testFile);
                console.log('✅ Test file upload successful');

                alert('File upload test completed successfully! Check console for details.');
                return true;

            } catch (error) {
                console.error('❌ File upload test failed:', error);

                let errorGuide = 'File upload test failed. ';

                if (error.code === 'storage/unauthorized') {
                    errorGuide += 'SOLUTION: Update Firebase Storage rules to allow uploads.';
                } else if (error.code === 'storage/unauthenticated') {
                    errorGuide += 'SOLUTION: Make sure user is properly authenticated.';
                } else if (error.code === 'storage/bucket-not-found') {
                    errorGuide += 'SOLUTION: Check Firebase storage bucket configuration.';
                } else {
                    errorGuide += 'Check console for detailed error information.';
                }

                alert(errorGuide);
                return false;
            }
        };

        // Storage rules helper
        window.showStorageRulesGuide = () => {
            const rulesGuide = `
🔧 FIREBASE STORAGE RULES GUIDE 🔧

If you're getting "storage/unauthorized" errors, you need to update your Firebase Storage rules.

RECOMMENDED STORAGE RULES:

rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload/download their own files
    match /files/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow test uploads for debugging
    match /test/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

HOW TO UPDATE RULES:
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: "rusho-s-server-210a6"
3. Go to "Storage" in the left sidebar
4. Click on "Rules" tab
5. Replace the rules with the code above
6. Click "Publish"

ALTERNATIVE (LESS SECURE - FOR TESTING ONLY):
For testing purposes, you can temporarily use:

rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}

⚠️  Remember to use proper security rules in production!
    `;

            console.log(rulesGuide);
            alert('Storage rules guide logged to console. Please check the console for detailed instructions.');
        };
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }

    // Firebase auth state listener
    onAuthStateChanged(auth, async (user) => {
        try {
            if (user) {
                currentUser = user;
                console.log('User authenticated:', user.email);

                // Load or create user data
                userData = await loadUserData(user);

                const name = userData ? userData.name : (user.displayName || 'User');
                userDisplayName.textContent = name;

                // Update last login
                if (userData) {
                    await updateUserData({ lastLogin: new Date().toISOString() });
                }

                // Show main app
                loadingScreen.classList.add('hidden');
                authContainer.classList.add('hidden');
                mainContainer.classList.remove('hidden');

                // Load user's files
                await loadFiles();

                // Show welcome message (only if this is a fresh login, not a page refresh)
                if (!sessionStorage.getItem('welcomeShown')) {
                    showWelcomeMessage(name);
                    sessionStorage.setItem('welcomeShown', 'true');
                }
            } else {
                currentUser = null;
                userData = null;
                files = [];
                sessionStorage.removeItem('welcomeShown');

                console.log('No user authenticated, showing auth screen');

                // Show auth screen
                loadingScreen.classList.add('hidden');
                authContainer.classList.remove('hidden');
                mainContainer.classList.add('hidden');
            }
        } catch (error) {
            console.error('Auth state change error:', error);
            // Fallback to show auth screen if there's an error
            loadingScreen.classList.add('hidden');
            authContainer.classList.remove('hidden');
            mainContainer.classList.add('hidden');
        }
    });

    // Fallback timeout to ensure loading screen is hidden
    setTimeout(() => {
        if (!loadingScreen.classList.contains('hidden')) {
            console.log('Loading screen timeout, showing auth screen');
            loadingScreen.classList.add('hidden');
            authContainer.classList.remove('hidden');
            mainContainer.classList.add('hidden');
        }
    }, 3000);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // ESC to close modals
    if (e.key === 'Escape') {
        if (!deleteModal.classList.contains('hidden')) {
            hideDeleteModal();
        } else if (!document.getElementById('file-viewer-modal').classList.contains('hidden')) {
            hideFileViewerModal();
        }
    }

    // Ctrl+U to trigger file upload
    if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        console.log('Ctrl+U pressed, triggering file upload');
        // Add a small delay to prevent conflicts
        setTimeout(() => {
            fileInput.click();
        }, 100);
    }
});

// Service worker registration for offline functionality - temporarily disabled for debugging
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
*/

// Debug functions for testing
window.testFirebaseConnection = async () => {
    console.log('=== FIREBASE CONNECTION TEST ===');
    console.log('Firebase Config:', firebaseConfig);
    console.log('Auth object:', auth);
    console.log('DB object:', db);
    console.log('Storage object:', storage);

    try {
        // Test Firestore
        console.log('Testing Firestore connection...');
        const testRef = collection(db, 'test');
        console.log('✅ Firestore connection successful');

        // Test Auth
        console.log('Testing Auth service...');
        console.log('Current user:', auth.currentUser);
        console.log('✅ Auth service accessible');

        alert('Firebase connection test passed! Check console for details.');
        return true;
    } catch (error) {
        console.error('❌ Firebase connection test failed:', error);
        alert('Firebase connection test failed: ' + error.message);
        return false;
    }
};

// Force reload files for debugging
window.forceRefreshFiles = async () => {
    console.log('=== FORCE REFRESH FILES ===');
    console.log('Current user:', currentUser?.uid);
    console.log('Current files count:', files.length);

    if (!currentUser) {
        console.log('❌ No user logged in');
        alert('Please login first');
        return;
    }

    try {
        await loadFiles();
        console.log('✅ Files refreshed successfully');
        console.log('New files count:', files.length);
        alert(`Files refreshed! Found ${files.length} files. Check console for details.`);
    } catch (error) {
        console.error('❌ Force refresh failed:', error);
        alert('Force refresh failed: ' + error.message);
    }
};

// Debug function to check Firestore directly
window.debugFirestoreFiles = async () => {
    console.log('=== FIRESTORE DEBUG ===');

    if (!currentUser) {
        console.log('❌ No user logged in');
        alert('Please login first');
        return;
    }

    try {
        console.log('Checking Firestore files collection directly...');
        console.log('User ID:', currentUser.uid);

        // Get ALL files in the collection (for debugging)
        const allFilesSnapshot = await getDocs(collection(db, 'files'));
        console.log('Total files in collection:', allFilesSnapshot.size);

        let userFiles = [];
        allFilesSnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('File in collection:', {
                id: doc.id,
                name: data.name,
                userId: data.userId,
                isMyFile: data.userId === currentUser.uid
            });

            if (data.userId === currentUser.uid) {
                userFiles.push({ ...data, docId: doc.id });
            }
        });

        console.log('Files belonging to current user:', userFiles.length);
        userFiles.forEach((file, index) => {
            console.log(`User file ${index + 1}:`, {
                name: file.name,
                type: file.type,
                uploadDate: file.uploadDate,
                size: file.size
            });
        });

        alert(`Firestore debug complete! Found ${userFiles.length} files for current user. Check console for details.`);

    } catch (error) {
        console.error('❌ Firestore debug failed:', error);
        alert('Firestore debug failed: ' + error.message);
    }
};

// Add refresh button to debug panel
window.addRefreshButton = () => {
    const debugPanel = document.querySelector('.debug-panel');
    if (debugPanel && !document.getElementById('refresh-files-btn')) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refresh-files-btn';
        refreshBtn.className = 'debug-btn';
        refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Files';
        refreshBtn.onclick = window.forceRefreshFiles;
        debugPanel.appendChild(refreshBtn);

        const debugBtn = document.createElement('button');
        debugBtn.id = 'debug-firestore-btn';
        debugBtn.className = 'debug-btn';
        debugBtn.innerHTML = '<i class="fas fa-search"></i> Debug Firestore';
        debugBtn.onclick = window.debugFirestoreFiles;
        debugPanel.appendChild(debugBtn);
    }
};

// Call this when page loads
setTimeout(() => {
    window.addRefreshButton();
}, 2000);

// Debug functions for upload flow and file loading issues
window.debugUploadFlow = async () => {
    console.log('=== UPLOAD FLOW DEBUG ===');

    if (!currentUser) {
        console.log('❌ No user logged in');
        alert('Please login first');
        return;
    }

    console.log('Current user:', currentUser.uid);
    console.log('Current files count before:', files.length);

    // Test file type detection
    console.log('\n--- File Type Detection Test ---');
    const testFiles = ['test.webm', 'Button.webm', 'video.mp4', 'image.jpg'];
    testFiles.forEach(filename => {
        const type = getFileType(filename);
        console.log(`${filename} -> ${type}`);
    });

    // Check current filter and search settings
    console.log('\n--- UI State ---');
    console.log('Current filter:', currentFilter);
    console.log('Search query:', searchQuery);
    console.log('Current view:', currentView);

    // Check DOM elements
    console.log('\n--- DOM Elements ---');
    console.log('Files container exists:', !!filesContainer);
    console.log('Empty state exists:', !!emptyState);
    console.log('Files container content:', filesContainer?.innerHTML?.length || 0, 'characters');
    console.log('Empty state visible:', !emptyState?.classList.contains('hidden'));

    // Force a file load and render
    console.log('\n--- Force Reload ---');
    try {
        await loadFiles();
        console.log('Files after reload:', files.length);
    } catch (error) {
        console.error('Reload failed:', error);
    }

    console.log('=== DEBUG COMPLETE ===');
    alert('Upload flow debug complete! Check console for detailed information.');
};

// Test PDF viewing functionality
window.testPDFViewer = () => {
    console.log('=== PDF VIEWER TEST ===');

    // Test with a sample PDF URL (you can replace with your actual PDF URL)
    const testPDFUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const testFilename = 'test-document.pdf';

    console.log('Testing PDF viewer with sample PDF...');

    try {
        // Open the file viewer modal
        const fileViewerModal = document.getElementById('file-viewer-modal');
        const fileViewerContainer = document.getElementById('file-viewer-container');
        const viewerFileName = document.getElementById('viewer-file-name');

        viewerFileName.textContent = testFilename;
        fileViewerModal.classList.remove('hidden');
        fileViewerModal.style.display = 'flex';

        // Test the PDF loading
        loadPDFViewer(testPDFUrl, testFilename, fileViewerContainer);

        console.log('✅ PDF viewer test initiated');
        alert('PDF viewer test started! Check the modal that opened. If it doesn\'t work, try with your actual PDF file.');

    } catch (error) {
        console.error('❌ PDF viewer test failed:', error);
        alert('PDF viewer test failed: ' + error.message);
    }
};

// Test PDF with user's actual file
window.testUserPDF = () => {
    console.log('=== USER PDF TEST ===');

    if (!currentUser) {
        alert('Please login first');
        return;
    }

    // Find PDF files in user's collection
    const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
        alert('No PDF files found in your collection. Upload a PDF file first.');
        console.log('No PDF files found');
        return;
    }

    console.log('Found PDF files:', pdfFiles.map(f => f.name));

    // Test with the first PDF file
    const testFile = pdfFiles[0];
    console.log('Testing with PDF:', testFile.name);
    console.log('PDF URL:', testFile.url.substring(0, 50) + '...');

    try {
        viewFile(testFile.url, testFile.name, testFile.type);
        console.log('✅ User PDF test initiated');
        alert(`Testing PDF viewer with your file: ${testFile.name}`);

    } catch (error) {
        console.error('❌ User PDF test failed:', error);
        alert('User PDF test failed: ' + error.message);
    }
};

// Check browser PDF support
window.checkPDFSupport = () => {
    console.log('=== BROWSER PDF SUPPORT CHECK ===');

    const results = {
        navigatorPlugins: !!navigator.plugins,
        hasAdobePlugin: false,
        hasChromePlugin: false,
        supportsEmbed: !!document.createElement('embed'),
        supportsObject: !!document.createElement('object'),
        supportsIframe: !!document.createElement('iframe'),
        userAgent: navigator.userAgent
    };

    // Check for PDF plugins
    if (navigator.plugins) {
        for (let i = 0; i < navigator.plugins.length; i++) {
            const plugin = navigator.plugins[i];
            if (plugin.name.toLowerCase().includes('adobe') && plugin.name.toLowerCase().includes('pdf')) {
                results.hasAdobePlugin = true;
            }
            if (plugin.name.toLowerCase().includes('chrome pdf')) {
                results.hasChromePlugin = true;
            }
        }
    }

    console.log('Browser PDF Support Results:', results);

    let message = 'Browser PDF Support Check:\n\n';
    message += `✅ Embed Support: ${results.supportsEmbed}\n`;
    message += `✅ Object Support: ${results.supportsObject}\n`;
    message += `✅ Iframe Support: ${results.supportsIframe}\n`;
    message += `📄 Adobe PDF Plugin: ${results.hasAdobePlugin}\n`;
    message += `🌐 Chrome PDF Plugin: ${results.hasChromePlugin}\n`;
    message += `\nBrowser: ${results.userAgent.split(' ')[0]}\n`;
    message += `\nCheck console for detailed results.`;

    alert(message);
};
