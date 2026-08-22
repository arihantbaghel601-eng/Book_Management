// ============================================
// DATA LAYER - localStorage Wrapper
// ============================================
const Storage = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    },
    set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },
    getMap(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch {
            return {};
        }
    },
    setMap(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }
};

// ============================================
// ID GENERATOR
// ============================================
function generateId(prefix) {
    const items = Storage.get(prefix === 'B' ? 'books' :
                              prefix === 'M' ? 'members' : 'loans');
    let max = 0;
    items.forEach(item => {
        const num = parseInt(item.id.replace(prefix, ''));
        if (num > max) max = num;
    });
    return prefix + String(max + 1).padStart(3, '0');
}

// ============================================
// CORE LOGIC - AppController
// ============================================
const App = {

    // --- BOOKS ---
    addBook(data) {
        if (!data.title || !data.author) {
            return { ok: false, msg: 'Title and author are required.' };
        }
        if (data.totalCopies < 1) {
            return { ok: false, msg: 'Copies must be at least 1.' };
        }
        const books = Storage.get('books');
        if (data.isbn && books.some(b => b.isbn === data.isbn)) {
            return { ok: false, msg: 'ISBN already exists.' };
        }
        const book = {
            id: generateId('B'),
            title: data.title.trim(),
            author: data.author.trim(),
            isbn: (data.isbn || '').trim(),
            genre: (data.genre || 'General').trim(),
            year: parseInt(data.year) || new Date().getFullYear(),
            totalCopies: parseInt(data.totalCopies),
            availableCopies: parseInt(data.totalCopies)
        };
        books.push(book);
        Storage.set('books', books);
        return { ok: true, msg: `Book "${book.title}" added. ID: ${book.id}` };
    },

    deleteBook(bookId) {
        let books = Storage.get('books');
        const book = books.find(b => b.id === bookId);
        if (!book) return { ok: false, msg: 'Book not found.' };
        if (book.availableCopies < book.totalCopies) {
            return { ok: false, msg: 'Cannot delete. Some copies are issued.' };
        }
        books = books.filter(b => b.id !== bookId);
        Storage.set('books', books);
        return { ok: true, msg: 'Book deleted.' };
    },

    searchBooks(keyword) {
        const books = Storage.get('books');
        if (!keyword) return books;
        const key = keyword.toLowerCase();
        return books.filter(b =>
            b.title.toLowerCase().includes(key) ||
            b.author.toLowerCase().includes(key) ||
            b.genre.toLowerCase().includes(key) ||
            b.isbn.toLowerCase().includes(key)
        ).sort((a, b) => a.title.localeCompare(b.title));
    },

    // --- MEMBERS ---
    registerMember(data) {
        if (!data.name) return { ok: false, msg: 'Name is required.' };
        const members = Storage.get('members');
        const member = {
            id: generateId('M'),
            name: data.name.trim(),
            type: data.type || 'Student',
            email: (data.email || '').trim()
        };
        members.push(member);
        Storage.set('members', members);
        return { ok: true, msg: `Member "${member.name}" registered. ID: ${member.id}` };
    },

    getMemberLimits(member) {
        if (member.type === 'Faculty') {
            return { maxBooks: 5, loanDays: 30, finePerDay: 1 };
        }
        return { maxBooks: 3, loanDays: 14, finePerDay: 2 };
    },

    activeLoanCount(memberId) {
        const loans = Storage.get('loans');
        return loans.filter(l => l.memberId === memberId && !l.returned).length;
    },

    // --- ISSUE ---
    issueBook(memberId, bookId) {
        const members = Storage.get('members');
        const member = members.find(m => m.id === memberId);
        if (!member) return { ok: false, msg: 'Member not found.' };

        const books = Storage.get('books');
        const book = books.find(b => b.id === bookId);
        if (!book) return { ok: false, msg: 'Book not found.' };

        const limits = this.getMemberLimits(member);

        if (this.activeLoanCount(memberId) >= limits.maxBooks) {
            return { ok: false, msg: `Borrowing limit reached (${limits.maxBooks}).` };
        }

        const loans = Storage.get('loans');
        const hasSame = loans.some(l =>
            l.memberId === memberId && l.bookId === bookId && !l.returned
        );
        if (hasSame) {
            return { ok: false, msg: 'Member already has this book.' };
        }

        if (book.availableCopies <= 0) {
            return { ok: false, msg: 'No copies available. Please reserve.' };
        }

        const reservations = Storage.getMap('reservations');
        const queue = reservations[bookId] || [];
        if (queue.length > 0 && queue[0] !== memberId) {
            return { ok: false, msg: 'Book reserved for another member.' };
        }
        if (queue.length > 0 && queue[0] === memberId) {
            queue.shift();
            reservations[bookId] = queue;
            Storage.setMap('reservations', reservations);
        }

        const now = new Date();
        const due = new Date(now);
        due.setDate(due.getDate() + limits.loanDays);

        const loan = {
            id: generateId('L'),
            bookId: bookId,
            memberId: memberId,
            issueDate: now.toISOString(),
            dueDate: due.toISOString(),
            returnDate: null,
            returned: false,
            fine: 0
        };

        loans.push(loan);
        Storage.set('loans', loans);

        book.availableCopies--;
        Storage.set('books', books);

        return {
            ok: true,
            msg: `Book issued. Loan ID: ${loan.id}. Due: ${due.toLocaleDateString()}`
        };
    },

    // --- RETURN ---
    returnBook(loanId) {
        const loans = Storage.get('loans');
        const loan = loans.find(l => l.id === loanId);
        if (!loan) return { ok: false, msg: 'Loan not found.' };
        if (loan.returned) return { ok: false, msg: 'Already returned.' };

        const members = Storage.get('members');
        const member = members.find(m => m.id === loan.memberId);
        const limits = member ? this.getMemberLimits(member) : { finePerDay: 2 };

        const now = new Date();
        const due = new Date(loan.dueDate);
        const diffMs = now - due;
        const lateDays = Math.max(0, Math.ceil(diffMs / 86400000));
        loan.fine = lateDays * limits.finePerDay;
        loan.returned = true;
        loan.returnDate = now.toISOString();
        Storage.set('loans', loans);

        const books = Storage.get('books');
        const book = books.find(b => b.id === loan.bookId);
        if (book && book.availableCopies < book.totalCopies) {
            book.availableCopies++;
            Storage.set('books', books);
        }

        let extra = '';
        const reservations = Storage.getMap('reservations');
        const queue = reservations[loan.bookId] || [];
        if (queue.length > 0) {
            extra = ` Next in queue: ${queue[0]}`;
        }

        return {
            ok: true,
            msg: `Returned. Fine: Rs. ${loan.fine.toFixed(2)}.${extra}`
        };
    },

    // --- RESERVE ---
    reserveBook(memberId, bookId) {
        const members = Storage.get('members');
        if (!members.find(m => m.id === memberId)) {
            return { ok: false, msg: 'Member not found.' };
        }

        const books = Storage.get('books');
        const book = books.find(b => b.id === bookId);
        if (!book) return { ok: false, msg: 'Book not found.' };

        const loans = Storage.get('loans');
        const hasActive = loans.some(l =>
            l.memberId === memberId && l.bookId === bookId && !l.returned
        );
        if (hasActive) return { ok: false, msg: 'Already issued this book.' };

        const reservations = Storage.getMap('reservations');
        const queue = reservations[bookId] || [];

        if (book.availableCopies > 0 && queue.length === 0) {
            return { ok: false, msg: 'Book is available. Issue it directly.' };
        }

        if (queue.includes(memberId)) {
            return { ok: false, msg: 'Already reserved.' };
        }

        queue.push(memberId);
        reservations[bookId] = queue;
        Storage.setMap('reservations', reservations);

        return { ok: true, msg: `Reserved. Position: ${queue.length}` };
    },

    // --- DASHBOARD ---
    getStats() {
        const books = Storage.get('books');
        const members = Storage.get('members');
        const loans = Storage.get('loans');
        const now = new Date();

        const activeLoans = loans.filter(l => !l.returned);
        const overdue = activeLoans.filter(l => new Date(l.dueDate) < now);

        return {
            totalBooks: books.reduce((s, b) => s + b.totalCopies, 0),
            members: members.length,
            active: activeLoans.length,
            overdue: overdue.length
        };
    }
};

// ============================================
// UI CONTROLLER
// ============================================

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = link.getAttribute('data-page');
        document.getElementById('page-' + page).classList.add('active');
        refreshPage(page);
    });
});

function refreshPage(page) {
    if (page === 'dashboard') renderDashboard();
    if (page === 'books') renderBooks();
    if (page === 'members') renderMembers();
    if (page === 'loans') renderLoans();
    if (page === 'reservations') renderReservations();
}

// Modals
function showModal(id) {
    document.getElementById(id).classList.add('show');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('show');
}

// Result display
function showResult(elementId, ok, msg) {
    const el = document.getElementById(elementId);
    el.textContent = msg;
    el.className = 'result-box ' + (ok ? 'success' : 'error');
}

// Dashboard
function renderDashboard() {
    const stats = App.getStats();
    document.getElementById('stat-books').textContent = stats.totalBooks;
    document.getElementById('stat-members').textContent = stats.members;
    document.getElementById('stat-active').textContent = stats.active;
    document.getElementById('stat-overdue').textContent = stats.overdue;
}

// Books
function renderBooks(keyword) {
    const books = App.searchBooks(keyword || '');
    const tbody = document.getElementById('books-table-body');
    tbody.innerHTML = books.map(b => `
        <tr>
            <td><strong>${b.id}</strong></td>
            <td>${escapeHtml(b.title)}</td>
            <td>${escapeHtml(b.author)}</td>
            <td>${escapeHtml(b.isbn)}</td>
            <td>${escapeHtml(b.genre)}</td>
            <td>${b.year}</td>
            <td>${b.availableCopies}/${b.totalCopies}</td>
            <td><button class="btn danger" onclick="handleDeleteBook('${b.id}')">Delete</button></td>
        </tr>
    `).join('');
}

document.getElementById('book-search').addEventListener('input', (e) => {
    renderBooks(e.target.value);
});

function handleAddBook() {
    const result = App.addBook({
        title: document.getElementById('book-title').value,
        author: document.getElementById('book-author').value,
        isbn: document.getElementById('book-isbn').value,
        genre: document.getElementById('book-genre').value,
        year: document.getElementById('book-year').value,
        totalCopies: document.getElementById('book-copies').value
    });
    alert(result.msg);
    if (result.ok) {
        hideModal('add-book-modal');
        renderBooks();
        document.getElementById('book-title').value = '';
        document.getElementById('book-author').value = '';
        document.getElementById('book-isbn').value = '';
        document.getElementById('book-genre').value = '';
        document.getElementById('book-year').value = '';
        document.getElementById('book-copies').value = '';
    }
}

function handleDeleteBook(id) {
    if (!confirm('Delete this book?')) return;
    const result = App.deleteBook(id);
    alert(result.msg);
    renderBooks();
}

// Members
function renderMembers(keyword) {
    const members = Storage.get('members');
    const key = (keyword || '').toLowerCase();
    const filtered = key
        ? members.filter(m =>
            m.name.toLowerCase().includes(key) ||
            m.id.toLowerCase().includes(key))
        : members;

    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = filtered.map(m => {
        const limits = App.getMemberLimits(m);
        const active = App.activeLoanCount(m.id);
        return `
        <tr>
            <td><strong>${m.id}</strong></td>
            <td>${escapeHtml(m.name)}</td>
            <td>${m.type}</td>
            <td>${escapeHtml(m.email)}</td>
            <td>${limits.maxBooks}</td>
            <td>${active}</td>
            <td>-</td>
        </tr>`;
    }).join('');
}

document.getElementById('member-search').addEventListener('input', (e) => {
    renderMembers(e.target.value);
});

function handleAddMember() {
    const result = App.registerMember({
        name: document.getElementById('member-name').value,
        type: document.getElementById('member-type').value,
        email: document.getElementById('member-email').value
    });
    alert(result.msg);
    if (result.ok) {
        hideModal('add-member-modal');
        renderMembers();
        document.getElementById('member-name').value = '';
        document.getElementById('member-email').value = '';
    }
}

// Issue
function handleIssueBook() {
    const memberId = document.getElementById('issue-member-id').value.trim();
    const bookId = document.getElementById('issue-book-id').value.trim();
    const result = App.issueBook(memberId, bookId);
    showResult('issue-result', result.ok, result.msg);
    if (result.ok) {
        document.getElementById('issue-member-id').value = '';
        document.getElementById('issue-book-id').value = '';
    }
}

// Return
function handleReturnBook() {
    const loanId = document.getElementById('return-loan-id').value.trim();
    const result = App.returnBook(loanId);
    showResult('return-result', result.ok, result.msg);
    if (result.ok) {
        document.getElementById('return-loan-id').value = '';
    }
}

// Reserve
function handleReserveBook() {
    const memberId = document.getElementById('reserve-member-id').value.trim();
    const bookId = document.getElementById('reserve-book-id').value.trim();
    const result = App.reserveBook(memberId, bookId);
    showResult('reserve-result', result.ok, result.msg);
}

function renderReservations() {
    const reservations = Storage.getMap('reservations');
    const container = document.getElementById('reservations-list');
    let html = '';
    for (const [bookId, queue] of Object.entries(reservations)) {
        if (queue.length === 0) continue;
        const books = Storage.get('books');
        const book = books.find(b => b.id === bookId);
        const title = book ? book.title : bookId;
        html += `<div class="reservation-card">
            <strong>${bookId} - ${escapeHtml(title)}</strong><br>
            Queue: ${queue.join(' → ')}
        </div>`;
    }
    container.innerHTML = html || '<p>No active reservations.</p>';
}

// Loans
function renderLoans() {
    const loans = Storage.get('loans');
    const now = new Date();
    const tbody = document.getElementById('loans-table-body');
    tbody.innerHTML = loans.map(l => {
        let status = 'Returned';
        let badgeClass = 'returned';
        if (!l.returned) {
            const overdue = new Date(l.dueDate) < now;
            status = overdue ? 'Overdue' : 'Active';
            badgeClass = overdue ? 'overdue' : 'active';
        }
        return `
        <tr>
            <td><strong>${l.id}</strong></td>
            <td>${l.bookId}</td>
            <td>${l.memberId}</td>
            <td>${new Date(l.issueDate).toLocaleDateString()}</td>
            <td>${new Date(l.dueDate).toLocaleDateString()}</td>
            <td>${l.returnDate ? new Date(l.returnDate).toLocaleDateString() : '-'}</td>
            <td><span class="badge ${badgeClass}">${status}</span></td>
            <td>Rs. ${l.fine.toFixed(2)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="8">No loans yet.</td></tr>';
}

// XSS Prevention
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Seed demo data on first load
function seedDemoData() {
    if (Storage.get('books').length > 0) return;

    const demoBooks = [
        { title: 'Clean Code', author: 'Robert Martin', isbn: '978-0132350884', genre: 'Programming', year: 2008, totalCopies: 2 },
        { title: 'Introduction to Algorithms', author: 'Cormen', isbn: '978-0262033848', genre: 'Algorithms', year: 2009, totalCopies: 1 },
        { title: 'The C++ Programming Language', author: 'Bjarne Stroustrup', isbn: '978-0321563842', genre: 'Programming', year: 2013, totalCopies: 2 },
        { title: 'Design Patterns', author: 'Gang of Four', isbn: '978-0201633610', genre: 'Software Engineering', year: 1994, totalCopies: 1 }
    ];
    demoBooks.forEach(b => App.addBook(b));

    App.registerMember({ name: 'Amit Sharma', type: 'Student', email: 'amit@college.edu' });
    App.registerMember({ name: 'Neha Verma', type: 'Student', email: 'neha@college.edu' });
    App.registerMember({ name: 'Dr. Rao', type: 'Faculty', email: 'rao@college.edu' });
}

// Initialize
seedDemoData();
renderDashboard();