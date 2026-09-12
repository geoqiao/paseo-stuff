# MATH-LIVE-B 边界检查

在数学写作中，**符号一致性**和*可核验性*同样重要，像 `code` 一样，公式也要“能被复现”。我们经常会见到行内 \(x_i\) 的记法，并且示例里也会出现价格 $5$ 与 $10$ 这类普通文本变量。

1. 勾股关系是最经典的几何模板之一：  
   $$
   a^2+b^2=c^2
   $$  
   这个结构可用于长度、距离与误差界限的估计，也常被当作后续模型中的范数基础。

> 在极限讨论时可写出如下独立公式：  
> \[
> \lim_{n\to\infty}\left(1+\frac{1}{n}\right)^n = e
> \]

```python
def price_tags():
    note = "$$not_math$$"
    prices = [5, 10]
    return f"{note}: basic={prices[0]}, pro={prices[1]}"
```

```math
\[
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x\\
y
\end{pmatrix}
=
\begin{pmatrix}
ax+by\\
cx+dy
\end{pmatrix}
\]
```

$$
a_1x_1+a_2x_2+a_3x_3+a_4x_4+a_5x_5+a_6x_6+a_7x_7+a_8x_8+a_9x_9+a_{10}x_{10}+a_{11}x_{11}+a_{12}x_{12}+a_{13}x_{13}+a_{14}x_{14}+a_{15}x_{15}+a_{16}x_{16}+a_{17}x_{17}+a_{18}x_{18}+a_{19}x_{19}+a_{20}x_{20}+a_{21}x_{21}+a_{22}x_{22}+a_{23}x_{23}+a_{24}x_{24}=L
$$

错误前正文：以下为故意插入的非法表达式，用于边界检测。  
$$
\badUnknownCommand{1}
$$
错误后正文：非法指令不会影响后续段落继续出现合法内容。  
$$
e^{i\pi}+1=0
$$

END-MATH-LIVE-B
