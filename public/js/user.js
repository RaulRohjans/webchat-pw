/**
 * User Class
 */

class User {

    constructor(id, username, email, pwHash) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.pwHash = pwHash;
    }

}

module.exports = User;