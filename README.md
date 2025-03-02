# Portfolio Website Backend

This repository contains the backend code for Parth Soni's portfolio website. It provides API endpoints for the frontend, handles data storage and retrieval, authentication, and Jupyter notebook processing.

## 🔍 Project Overview

This Express.js-based backend features:
- RESTful API endpoints for case studies and admin functionality
- Azure SQL database integration via Prisma ORM
- JWT-based authentication for admin access
- Jupyter notebook conversion to HTML
- Email services for contact form

## 📁 File Structure & Description

### Core Files

- `index.js` - Main application entry point and Express server setup
- `package.json` - Project dependencies and scripts
- `prisma/schema.prisma` - Database schema definition for Azure SQL
- `build.sh` - Build script for Render deployment with Jupyter installation

### Routes & Controllers

- `api/case-studies` - CRUD operations for case studies
- `api/auth` - Authentication endpoints for admin login
- `api/upload` - File upload handling for Jupyter notebooks
- `api/email` - Email sending functionality for contact form
- `api/health-check` - API health check endpoint

### Middleware

- `middleware/auth.js` - JWT authentication middleware
- `middleware/errorHandler.js` - Global error handling
- `middleware/fileUpload.js` - Multer configuration for file uploads

### Utilities

- `utils/notebook-converter.js` - Jupyter notebook to HTML conversion
- `utils/email.js` - Email service configuration
- `utils/db.js` - Azure SQL database connection management

## 🔧 Technologies Used

- Node.js
- Express.js
- Prisma ORM
- Azure SQL Database
- JWT for authentication
- Multer for file uploads
- Jupyter nbconvert (for notebook conversion)
- Nodemailer

## 🚀 Setup and Installation

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Azure SQL Database instance
- Python with Jupyter (for notebook conversion)

### Installation Steps

1. Clone the repository:

    ```bash
    git clone https://github.com/ParthSoni-CS/portfolio-backend.git
    cd portfolio-backend
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Install Python dependencies:

    ```bash
    pip install jupyter nbconvert
    ```

4. Create a [.env](http://_vscodecontentref_/0) file with the following variables:

    ```
    DATABASE_URL="sqlserver://username:password@your-azure-server.database.windows.net:1433?database=portfolio-db&encrypt=true"
    JWT_SECRET="your-secret-key"
    EMAIL_USER="your-email@gmail.com"
    EMAIL_PASS="your-app-password"
    NODE_ENV="development"
    ```

5. Set up the database:

    ```bash
    npx prisma migrate dev
    npx prisma generate
    ```

## 💻 Development Workflow

1. Start the development server:

    ```bash
    npm run dev
    ```

2. The server will be available at `http://localhost:5000`

3. Test API endpoints using tools like Postman, Insomnia, or curl

## 🏗️ Building for Production

```bash
npm run build
