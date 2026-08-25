package com.traces.app.core.ui.component

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * Draws a QR code straight onto the canvas.
 *
 * zxing gives a matrix of bits; turning that into a Bitmap first would cost an
 * allocation and a scale, and modules drawn as rectangles stay crisp at any
 * size.
 */
@Composable
fun QrCode(
    content: String,
    modifier: Modifier = Modifier,
    foreground: Color = Color.Black,
    background: Color = Color.White,
) {
    val matrix: BitMatrix? = remember(content) {
        runCatching {
            QRCodeWriter().encode(
                content,
                BarcodeFormat.QR_CODE,
                0,
                0,
                mapOf(
                    EncodeHintType.MARGIN to 1,
                    EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
                    EncodeHintType.CHARACTER_SET to "UTF-8",
                ),
            )
        }.getOrNull()
    }
    if (matrix == null) return

    Canvas(modifier) {
        val modules = matrix.width
        val module = size.minDimension / modules
        drawRect(color = background, topLeft = Offset.Zero, size = size)
        for (x in 0 until modules) {
            for (y in 0 until matrix.height) {
                if (!matrix.get(x, y)) continue
                drawRect(
                    color = foreground,
                    topLeft = Offset(x * module, y * module),
                    // A hairline of overlap stops seams appearing between modules.
                    size = Size(module + 0.5f, module + 0.5f),
                )
            }
        }
    }
}
