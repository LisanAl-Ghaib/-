<?php
require 'db.php';
$mysqli = new mysqli('localhost', 'user', 'pass', 'db');
$result = $mysqli->query('SELECT * FROM items');
?>
<html><body>Index</body></html>
