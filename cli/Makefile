.PHONY: build embed-frontend clean

# Copy frontend/dist to cli/embed/frontend/dist before building
embed-frontend:
	@echo "Copying frontend/dist to cli/embed/frontend/dist..."
	@mkdir -p embed/frontend
	@rm -rf embed/frontend/dist
	@cp -r ../frontend/dist embed/frontend/

# Build the CLI tool (requires frontend to be embedded first)
build: embed-frontend
	@echo "Building CLI tool..."
	@go build -o prr .

# Clean embedded frontend
clean:
	@rm -rf embed/frontend/dist
