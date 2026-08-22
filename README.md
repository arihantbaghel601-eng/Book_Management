# Book Management System

A web-based Book Management System built with HTML, CSS, and JavaScript.

## Features
- Add, search, and delete books
- Register Student and Faculty members
- Issue and return books with automatic fine calculation
- Reserve unavailable books with FIFO queue
- Dashboard with live statistics
- Data persistence using localStorage
- Responsive design
- Unit tests included

## How to Run
1. Clone the repository
2. Open `index.html` in any browser
3. Open `tests.html` to run unit tests

## Tech Stack
- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- localStorage for persistence

## Business Rules
| Rule | Student | Faculty |
|------|---------|---------|
| Max Books | 3 | 5 |
| Loan Period | 14 days | 30 days |
| Fine/Day | Rs. 2 | Rs. 1 |