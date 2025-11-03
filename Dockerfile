# 1. Use uma imagem base oficial do Python. A versão slim é menor e boa para produção.
FROM python:3.11-slim

# 2. Defina o diretório de trabalho dentro do container
WORKDIR /code

# 3. Copie o arquivo de dependências primeiro para aproveitar o cache do Docker
COPY ./requirements.txt /code/requirements.txt

# 4. Instale as dependências
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# 5. Copie todo o resto do seu código para dentro do container
COPY . /code/

# 6. Exponha a porta em que o uvicorn irá rodar dentro do container
EXPOSE 8004

# 7. Comando para iniciar a aplicação quando o container for executado
#    --host 0.0.0.0 é crucial para que a aplicação seja acessível de fora do container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]