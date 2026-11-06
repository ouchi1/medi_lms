const API_BASE = 'http://localhost:5000/api';

export const API = {
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'មានបញ្ហាកើតឡើង!');
        return data;
    },

    login(email, password) {
        return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    },

    registerStudent(fullName, email, password) {
        return this.request('/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password }) });
    },

    getLessons() {
        return this.request('/lessons');
    },

    getQCMSubjects() {
        return this.request('/qcm/subjects');
    },

    getQCMQuestions(subjectId) {
        return this.request(`/qcm/questions/${subjectId}`);
    },

    addQCMQuestion(data) {
        return this.request('/qcm/questions', { method: 'POST', body: JSON.stringify(data) });
    },

    bulkAddQCMQuestions(questions) {
        return this.request('/qcm/questions/bulk', { method: 'POST', body: JSON.stringify({ questions }) });
    },

    deleteQCMQuestion(questionId) {
        return this.request(`/qcm/questions/${questionId}`, { method: 'DELETE' });
    },
    deleteLesson(lessonId) {
        return this.request(`/lessons/${lessonId}`, { method: 'DELETE' });
    },
    resetPassword(email, newPassword) {
        return this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, newPassword })
        });
    },
    deleteSubject(subjectId) {
        return this.request(`/subjects/${subjectId}`, { method: 'DELETE' });
    },
    updateSubject(subjectId, name, parentId) {
        return this.request(`/subjects/${subjectId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, parentId })
        });
    },
        // បន្ថែមនៅក្រោម getQCMSubjects ឬ Function ផ្សេងៗ
    getSchools() {
        return this.request('/schools');
    },
    addSchool(data) {
        return this.request('/schools', { method: 'POST', body: JSON.stringify(data) });
    },
    updateSchool(schoolId, name) {
        return this.request(`/schools/${schoolId}`, {
            method: 'PUT',
            body: JSON.stringify({ name })
        });
    },
    // បន្ថែមមុខងារនេះចូលក្នុង API object របស់អ្នកក្នុង api.js
    async updateSchool(schoolId, schoolData) {
        return await this.request(`/schools/${schoolId}`, {
            method: 'PUT',
            body: JSON.stringify(schoolData)
        });
    }
};