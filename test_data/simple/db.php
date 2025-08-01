<?php
function db_connect() {
    return mysqli_connect('localhost', 'user', 'pass', 'db');
}
