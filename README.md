# Personal File Server 🗂️

A modern, secure web-based file server with Firebase authentication and a beautiful dark blue theme.

## Features ✨

- 🔐 **Firebase Authentication** - Secure login, registration, and password reset
- 📁 **File Management** - Upload, view, download, and delete files
- 🎨 **Modern UI** - Dark blue theme with glass-morphism effects
- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- 🖼️ **File Previews** - Support for images, videos, PDFs, and more
- 🔍 **Search & Filter** - Easy file discovery with search and filtering
- 💫 **Smooth Animations** - Beautiful transitions and hover effects

## Technologies Used 🛠️

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Authentication**: Firebase Auth v11.10.0
- **Styling**: CSS Grid, Flexbox, CSS Variables
- **Icons**: Font Awesome
- **File Handling**: HTML5 File API

## Getting Started 🚀

1. **Clone the repository**

   ```bash
   git clone https://github.com/rohan-rusho/FileShare.git
   cd FileShare
   ```

2. **Set up Firebase**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication with Email/Password
   - Copy your Firebase config to `firebase-config.js`

3. **Run the server**

   ```bash
   python -m http.server 8000
   ```

4. **Open in browser**
   Navigate to `http://localhost:8000`

## Project Structure 📂

```
FileShare/
├── index.html          # Main application file
├── app.js             # Application logic and Firebase integration
├── main.css           # Styling and themes
├── firebase-config.js # Firebase configuration
├── manifest.json      # PWA manifest
├── favicon.ico        # Application icon
├── favicon.svg        # SVG application icon
└── README.md          # This file
```

## Features Overview 📋

### Authentication System

- **Login/Register**: Secure user authentication
- **Forgot Password**: Email-based password reset
- **Emergency Authentication**: Fallback system for testing

### File Management

- **Upload**: Drag & drop or click to upload files
- **Gallery View**: Visual file cards with previews
- **List View**: Compact file listing
- **File Actions**: View, download, and delete files

### User Interface

- **Dark Theme**: Professional dark blue color scheme
- **Glass Effects**: Modern backdrop-filter styling
- **Responsive**: Mobile-first responsive design
- **Animations**: Smooth transitions and hover effects

## Browser Support 🌐

- Chrome 88+
- Firefox 87+
- Safari 14+
- Edge 88+

## Security 🔒

- Firebase Authentication for user management
- Secure file handling with proper validation
- HTTPS ready for production deployment

## Contributing 🤝

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License 📄

This project is open source and available under the [MIT License](LICENSE).

## Developer 👨‍💻

Built with ❤️ by **Ahmed Rohan Rusho**

- 📧 Email: [Contact Developer](mailto:your-email@example.com)
- 🌐 GitHub: [@rohan-rusho](https://github.com/rohan-rusho)
- 📱 Facebook: [Connect on Facebook](https://facebook.com/your-profile)
- 📸 Instagram: [Follow on Instagram](https://instagram.com/your-profile)

## Acknowledgments 🙏

- Firebase for authentication services
- Font Awesome for beautiful icons
- The open-source community for inspiration

---

⭐ **Star this repository if you find it helpful!**
